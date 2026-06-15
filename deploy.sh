#!/usr/bin/env bash

set -e  # exit immediately on error

# -------- CONFIG --------
REGISTRY="artifactory.sandisk.com:6629"
IMAGE_NAME="feat-tracking/app"
NAMESPACE="sdsmcv-prd"
DOCKERFILE="docker/Dockerfile"
K8S_DIR="k8s"
DEPLOYMENT="feat-tracking-app"
# ------------------------

# -------- ARG PARSING --------
VERSION=""

usage() {
  echo "Usage: $0 --version <version>"
  echo ""
  echo "Examples:"
  echo "  $0 --version 1.0.0"
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -v|--version)
      VERSION="$2"
      shift 2
      ;;
    *)
      usage
      ;;
  esac
done

if [[ -z "$VERSION" ]]; then
  echo "Version is required"
  usage
fi
# ----------------------------

IMAGE_VERSION="${REGISTRY}/${IMAGE_NAME}:${VERSION}"
IMAGE_LATEST="${REGISTRY}/${IMAGE_NAME}:latest"

echo "Starting deployment"
echo "Version      : ${VERSION}"
echo "Image (ver)  : ${IMAGE_VERSION}"
echo "Image (lat)  : ${IMAGE_LATEST}"
echo ""

# -------- DEPLOYMENT STEPS --------
echo "Setting kubectl namespace"
kubectl config set-context --current --namespace="${NAMESPACE}"

echo "Building Docker image"
docker buildx build --no-cache \
  -t "${IMAGE_VERSION}" \
  -t "${IMAGE_LATEST}" \
  -f "${DOCKERFILE}" .

echo "Pushing Docker images"
docker push "${IMAGE_LATEST}"
docker push "${IMAGE_VERSION}"

echo "Applying Kubernetes manifests"
kubectl apply -f "${K8S_DIR}/"
kubectl rollout restart deployment "${DEPLOYMENT}"

echo ""
echo "Deployment completed successfully"
