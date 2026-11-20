// The stand-in's answers as the server gives them: JSON with a status, 404 as not-found
export const json = (body: unknown, status = 200) => Response.json(body, { status });
export const notFound = () => json({ error: "not-found" }, 404);
