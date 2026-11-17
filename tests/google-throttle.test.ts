import { describe, expect, it, vi } from "vitest";
import { createGoogleThrottledFetch } from "@/lib/google-throttle";

describe("Google News throttle", () => {
  it("retries a rate-limited Google News request and returns the recovered response", async () => {
    const base = vi.fn()
      .mockResolvedValueOnce(new Response("slow down", { status: 429 }))
      .mockResolvedValueOnce(new Response("<rss />", { status: 200 }));
    const throttled = createGoogleThrottledFetch(base, [1, 1]);
    const response = await throttled("https://news.google.com/rss/search?q=x");
    expect(response.status).toBe(200);
    expect(base).toHaveBeenCalledTimes(2);
  });

  it("gives up after the retry budget and returns the last 429", async () => {
    const base = vi.fn(async () => new Response("slow down", { status: 429 }));
    const throttled = createGoogleThrottledFetch(base, [1, 1]);
    expect((await throttled("https://news.google.com/rss/x")).status).toBe(429);
    expect(base).toHaveBeenCalledTimes(3);
  });

  it("never runs more than four Google News requests at once", async () => {
    let running = 0;
    let peak = 0;
    const base = vi.fn(async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
      return new Response("ok");
    });
    const throttled = createGoogleThrottledFetch(base, []);
    await Promise.all(Array.from({ length: 12 }, (_, index) => throttled(`https://news.google.com/rss/${index}`)));
    expect(peak).toBeLessThanOrEqual(4);
    expect(base).toHaveBeenCalledTimes(12);
  });

  it("does not queue or retry other publishers", async () => {
    const base = vi.fn(async () => new Response("no", { status: 429 }));
    const throttled = createGoogleThrottledFetch(base, [1, 1]);
    expect((await throttled("https://apnews.com/article/x")).status).toBe(429);
    expect(base).toHaveBeenCalledTimes(1);
  });
});
