/* Shared durable Redis, required even in development. Never fall back to
   process memory: serverless instances must agree on revocations and claims. */
export async function redis(...command) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("Redis is not configured");
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Redis ${response.status}`);
  const data = await response.json();
  if (data.error) throw new Error("Redis command failed");
  return data.result;
}
