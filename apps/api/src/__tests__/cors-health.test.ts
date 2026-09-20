import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";

const app = createApp();

describe("CORS and Health Check", () => {
  it("returns 200 on /health without Origin header", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("ok");
    expect(res.body.data.service).toBe("daljir-api");
  });

  it("permits request from WEB_ORIGIN with credentials", async () => {
    const res = await request(app)
      .get("/health")
      .set("Origin", "http://localhost:3000");

    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("permits request from ADMIN_ORIGIN with credentials", async () => {
    const res = await request(app)
      .get("/health")
      .set("Origin", "http://localhost:3001");

    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:3001");
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("rejects request from unauthorized origin", async () => {
    const res = await request(app)
      .get("/health")
      .set("Origin", "http://unauthorized-evil.com");

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });
});
