/* Never derive OAuth redirects or allowed origins from the Host header. */
export function publicUrl(path) {
  return `${configuredOrigin()}${path}`;
}

export function configuredOrigin() {
  const url = new URL(process.env.PUBLIC_ORIGIN);
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
      !["http:", "https:"].includes(url.protocol)) throw new Error("Invalid PUBLIC_ORIGIN");
  return url.origin;
}

export function isDev() {
  try {
    const url = new URL(configuredOrigin());
    return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      process.env.NODE_ENV !== "production";
  } catch { return false; }
}
