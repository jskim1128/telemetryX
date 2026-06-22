import { prisma } from './prisma';

export type Bucket = 'day' | 'hour';

export interface DateRange {
    from: Date;
    to: Date;
}

export function parseDateRange(fromStr?: string | string[], toStr?: string | string[]): DateRange {
    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const fromRaw = Array.isArray(fromStr) ? fromStr[0] : fromStr;
    const toRaw = Array.isArray(toStr) ? toStr[0] : toStr;

    const from = fromRaw ? new Date(fromRaw) : defaultFrom;
    const to = toRaw ? new Date(toRaw) : now;

    return {
        from: isNaN(from.getTime()) ? defaultFrom : from,
        to: isNaN(to.getTime()) ? now : to
    };
}

/** Overview KPIs across an optional appId filter. */
export async function getOverview(opts: { range: DateRange; appId?: string; department?: string }) {
    const { range, appId, department } = opts;
    const where: any = { createdAt: { gte: range.from, lte: range.to } };
    if (appId) where.appId = appId;
    if (department) where.department = department;

    const [appOpens, features, tags, distinctEmails, activeApps] = await Promise.all([
        prisma.appOpenEvent.count({ where }),
        prisma.featureEvent.count({ where }),
        prisma.tagEvent.count({ where }),
        getUniqueEmails(range, appId, department),
        prisma.app.count({ where: { active: true } })
    ]);

    return {
        appOpens,
        featureTriggers: features,
        tagInstances: tags,
        uniqueUsers: distinctEmails,
        activeApps
    };
}

async function getUniqueEmails(range: DateRange, appId?: string, department?: string): Promise<number> {
    const where: any = { createdAt: { gte: range.from, lte: range.to } };
    if (appId) where.appId = appId;
    if (department) where.department = department;

    // Union of distinct emails across the three event tables.
    const [a, b, c] = await Promise.all([
        prisma.appOpenEvent.findMany({ where, select: { email: true }, distinct: ['email'] }),
        prisma.featureEvent.findMany({ where, select: { email: true }, distinct: ['email'] }),
        prisma.tagEvent.findMany({ where, select: { email: true }, distinct: ['email'] })
    ]);
    const set = new Set<string>();
    a.forEach((x) => set.add(x.email));
    b.forEach((x) => set.add(x.email));
    c.forEach((x) => set.add(x.email));
    return set.size;
}

/** Daily time series with separate counts per category.
 *
 * Implementation note: we bucket in JS to stay portable across SQLite (dev)
 * and PostgreSQL (prod). Volume is moderate (≤ 1M events/day) and we only
 * fetch the `createdAt` column for rows in the window — light enough.
 */
export async function getTimeSeries(opts: { range: DateRange; appId?: string; department?: string }) {
    const { range, appId, department } = opts;
    const where: any = { createdAt: { gte: range.from, lte: range.to } };
    if (appId) where.appId = appId;
    if (department) where.department = department;

    const [opens, features, tags] = await Promise.all([
        prisma.appOpenEvent.findMany({ where, select: { createdAt: true } }),
        prisma.featureEvent.findMany({ where, select: { createdAt: true } }),
        prisma.tagEvent.findMany({ where, select: { createdAt: true } })
    ]);

    const buckets = new Map<string, { day: string; category: string; count: number }>();
    const add = (when: Date, category: string) => {
        const day = when.toISOString().slice(0, 10);
        const key = `${day}|${category}`;
        const cur = buckets.get(key);
        if (cur) cur.count += 1;
        else buckets.set(key, { day, category, count: 1 });
    };
    opens.forEach((r) => add(r.createdAt, 'app_open'));
    features.forEach((r) => add(r.createdAt, 'feature'));
    tags.forEach((r) => add(r.createdAt, 'tag'));

    return Array.from(buckets.values()).sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

/** Top departments across all three event types within range. */
export async function getDepartmentBreakdown(opts: { range: DateRange; appId?: string }) {
    const { range, appId } = opts;
    const where: any = { createdAt: { gte: range.from, lte: range.to }, department: { not: null } };
    if (appId) where.appId = appId;

    const [a, b, c] = await Promise.all([
        prisma.appOpenEvent.groupBy({ by: ['department'], _count: { _all: true }, where }),
        prisma.featureEvent.groupBy({ by: ['department'], _count: { _all: true }, where }),
        prisma.tagEvent.groupBy({ by: ['department'], _count: { _all: true }, where })
    ]);

    const totals = new Map<string, number>();
    for (const arr of [a, b, c]) {
        for (const row of arr) {
            if (!row.department) continue;
            totals.set(row.department, (totals.get(row.department) || 0) + row._count._all);
        }
    }
    return Array.from(totals.entries())
        .map(([department, count]) => ({ department, count }))
        .sort((x, y) => y.count - x.count);
}

/** Top apps by total event count. */
export async function getTopApps(opts: { range: DateRange; limit?: number }) {
    const { range, limit = 10 } = opts;
    const where = { createdAt: { gte: range.from, lte: range.to } };

    const [a, b, c] = await Promise.all([
        prisma.appOpenEvent.groupBy({ by: ['appId'], _count: { _all: true }, where }),
        prisma.featureEvent.groupBy({ by: ['appId'], _count: { _all: true }, where }),
        prisma.tagEvent.groupBy({ by: ['appId'], _count: { _all: true }, where })
    ]);

    const totals = new Map<string, number>();
    for (const arr of [a, b, c]) {
        for (const row of arr) {
            totals.set(row.appId, (totals.get(row.appId) || 0) + row._count._all);
        }
    }
    const topIds = Array.from(totals.entries())
        .sort((x, y) => y[1] - x[1])
        .slice(0, limit);

    const apps = await prisma.app.findMany({
        where: { id: { in: topIds.map(([id]) => id) } },
        select: { id: true, name: true }
    });
    const nameById = new Map(apps.map((a) => [a.id, a.name]));

    return topIds.map(([id, count]) => ({
        appId: id,
        name: nameById.get(id) || '(deleted)',
        count
    }));
}

/** Top feature names for an app (or globally). */
export async function getTopFeatures(opts: { range: DateRange; appId?: string; limit?: number }) {
    const { range, appId, limit = 10 } = opts;
    const where: any = { createdAt: { gte: range.from, lte: range.to } };
    if (appId) where.appId = appId;

    const rows = await prisma.featureEvent.groupBy({
        by: ['featureName'],
        where,
        _count: { _all: true }
    });
    return rows
        .map((r) => ({ featureName: r.featureName, count: r._count._all }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
}

/** Daily time series per top feature for an app (or globally).
 *
 * Returns one bucket per (day, featureName) for the top-N feature names
 * within the range. Useful for plotting a multi-line trend of the most
 * used features over time. Days without activity for a given feature are
 * omitted; the client is expected to fill missing days with 0.
 */
export async function getTopFeatureTimeSeries(opts: { range: DateRange; appId?: string; limit?: number }) {
    const { range, appId, limit = 5 } = opts;
    const where: any = { createdAt: { gte: range.from, lte: range.to } };
    if (appId) where.appId = appId;

    // 1) Identify the top-N feature names in the window.
    const top = await prisma.featureEvent.groupBy({
        by: ['featureName'],
        where,
        _count: { _all: true }
    });
    const topNames = top
        .map((r) => ({ featureName: r.featureName, count: r._count._all }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit)
        .map((r) => r.featureName);

    if (topNames.length === 0) return [] as Array<{ day: string; featureName: string; count: number }>;

    // 2) Fetch raw events for those features and bucket by day in JS to stay
    // portable across SQLite (dev) and PostgreSQL (prod).
    const rows = await prisma.featureEvent.findMany({
        where: { ...where, featureName: { in: topNames } },
        select: { createdAt: true, featureName: true }
    });

    const buckets = new Map<string, { day: string; featureName: string; count: number }>();
    for (const r of rows) {
        const day = r.createdAt.toISOString().slice(0, 10);
        const key = `${day}|${r.featureName}`;
        const cur = buckets.get(key);
        if (cur) cur.count += 1;
        else buckets.set(key, { day, featureName: r.featureName, count: 1 });
    }
    return Array.from(buckets.values()).sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

/** Daily time series per top tag for an app (or globally).
 *
 * Mirrors {@link getTopFeatureTimeSeries} but for tag events. Returns one
 * bucket per (day, tag) for the top-N tag values within the range. Days
 * without activity for a given tag are omitted; the client is expected to
 * fill missing days with 0.
 */
export async function getTopTagTimeSeries(opts: { range: DateRange; appId?: string; limit?: number }) {
    const { range, appId, limit = 5 } = opts;
    const where: any = { createdAt: { gte: range.from, lte: range.to } };
    if (appId) where.appId = appId;

    // 1) Identify the top-N tags in the window.
    const top = await prisma.tagEvent.groupBy({
        by: ['tag'],
        where,
        _count: { _all: true }
    });
    const topNames = top
        .map((r) => ({ tag: r.tag, count: r._count._all }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit)
        .map((r) => r.tag);

    if (topNames.length === 0) return [] as Array<{ day: string; tag: string; count: number }>;

    // 2) Fetch raw events for those tags and bucket by day in JS to stay
    // portable across SQLite (dev) and PostgreSQL (prod).
    const rows = await prisma.tagEvent.findMany({
        where: { ...where, tag: { in: topNames } },
        select: { createdAt: true, tag: true }
    });

    const buckets = new Map<string, { day: string; tag: string; count: number }>();
    for (const r of rows) {
        const day = r.createdAt.toISOString().slice(0, 10);
        const key = `${day}|${r.tag}`;
        const cur = buckets.get(key);
        if (cur) cur.count += 1;
        else buckets.set(key, { day, tag: r.tag, count: 1 });
    }
    return Array.from(buckets.values()).sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

/** Top users (by email) for an app or globally.
 *
 * For each user, also computes the single most-triggered event (feature name
 * or tag value) along with how many times it occurred. App-open events are
 * excluded from "top event" since they are not user-driven actions worth
 * highlighting — but they still count toward the user's total events.
 */
export async function getTopUsers(opts: { range: DateRange; appId?: string; limit?: number }) {
    const { range, appId, limit = 10 } = opts;
    const where: any = { createdAt: { gte: range.from, lte: range.to } };
    if (appId) where.appId = appId;

    const [a, b, c, featureByUser, tagByUser] = await Promise.all([
        prisma.appOpenEvent.groupBy({ by: ['email'], _count: { _all: true }, where }),
        prisma.featureEvent.groupBy({ by: ['email'], _count: { _all: true }, where }),
        prisma.tagEvent.groupBy({ by: ['email'], _count: { _all: true }, where }),
        prisma.featureEvent.groupBy({ by: ['email', 'featureName'], _count: { _all: true }, where }),
        prisma.tagEvent.groupBy({ by: ['email', 'tag'], _count: { _all: true }, where })
    ]);
    const totals = new Map<string, number>();
    for (const arr of [a, b, c]) for (const r of arr) totals.set(r.email, (totals.get(r.email) || 0) + r._count._all);

    // Build per-user top event (feature or tag) with the highest count.
    type TopEvent = { label: string; type: 'feature' | 'tag'; count: number };
    const topEventByEmail = new Map<string, TopEvent>();
    const consider = (email: string, candidate: TopEvent) => {
        const cur = topEventByEmail.get(email);
        if (!cur || candidate.count > cur.count) topEventByEmail.set(email, candidate);
    };
    for (const r of featureByUser) consider(r.email, { label: r.featureName, type: 'feature', count: r._count._all });
    for (const r of tagByUser) consider(r.email, { label: r.tag, type: 'tag', count: r._count._all });

    return Array.from(totals.entries())
        .map(([email, count]) => {
            const top = topEventByEmail.get(email) || null;
            return {
                email,
                count,
                topEvent: top ? top.label : null,
                topEventType: top ? top.type : null,
                topEventCount: top ? top.count : 0
            };
        })
        .sort((x, y) => y.count - x.count)
        .slice(0, limit);
}

/** Top tag values for an app (or globally). */
export async function getTopTags(opts: { range: DateRange; appId?: string; limit?: number }) {
    const { range, appId, limit = 10 } = opts;
    const where: any = { createdAt: { gte: range.from, lte: range.to } };
    if (appId) where.appId = appId;

    const rows = await prisma.tagEvent.groupBy({
        by: ['tag'],
        where,
        _count: { _all: true }
    });
    return rows
        .map((r) => ({ tag: r.tag, count: r._count._all }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
}
