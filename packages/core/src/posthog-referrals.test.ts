import { describe, expect, it } from "vitest";
import {
  aggregatePostHogAiReferralRows,
  attachTrackedCitations,
  buildPostHogAiReferralsQuery,
  fetchPostHogAiReferrals,
  postHogReferralsConfiguration,
} from "./posthog-referrals.js";

describe("PostHog AI outcomes", () => {
  it("reports incomplete server-side configuration and normalizes success events", () => {
    expect(
      postHogReferralsConfiguration({ POSTHOG_HOST: "https://eu.posthog.com" }),
    ).toEqual({
      configured: false,
      missing: ["POSTHOG_PROJECT_ID", "POSTHOG_PERSONAL_API_KEY"],
      successEvents: [],
    });

    expect(
      postHogReferralsConfiguration({
        POSTHOG_SUCCESS_EVENTS:
          " demo requested, account created, demo requested ",
      }).successEvents,
    ).toEqual(["demo requested", "account created"]);

    expect(
      postHogReferralsConfiguration({
        POSTHOG_SEARCH_EVENT: "product search",
        POSTHOG_STOCK_ALERT_EVENT: "stock alert created",
      }).successEvents,
    ).toEqual(["product search", "stock alert created"]);
  });

  it("builds one bounded, site-scoped query for current and previous outcomes", () => {
    const query = buildPostHogAiReferralsQuery({
      website: "https://www.example.com/catalog",
      period: "30d",
      successEvents: ["demo requested", "account created"],
    });

    expect(query).toContain("timestamp >= now() - INTERVAL 60 DAY");
    expect(query).toContain("entry_host = 'example.com'");
    expect(query).toContain(
      "event IN ('$pageview', 'demo requested', 'account created')",
    );
    expect(query).toContain("event IN ('demo requested', 'account created')");
    expect(query).toContain("period_bucket");
    expect(query).toContain("session.$session_duration");
    expect(query).toContain("session.$is_bounce");
    expect(query).toContain("pageview_count");
    expect(query).toContain("GROUP BY session_id");
    expect(query).toContain(
      "row_number() OVER (PARTITION BY period_bucket, referring_domain",
    );
    expect(query).toContain("WHERE landing_rank <= 25");
    expect(query).not.toContain(";");
  });

  it("aggregates engagement, conversions, and a previous-period comparison", () => {
    // This fixture preserves PostHog's observed query response row encoding:
    // positional arrays inside the top-level `results` wrapper.
    const aggregated = aggregatePostHogAiReferralRows(
      [
        [
          "current",
          "chatgpt.com",
          "/stores",
          3,
          7,
          2,
          4,
          120,
          3,
          1,
          3,
          5,
          10,
          3,
          5,
          210,
          5,
          2,
          5,
        ],
        [
          "current",
          "chatgpt.com",
          "/mac",
          2,
          3,
          1,
          1,
          90,
          2,
          1,
          2,
          5,
          10,
          3,
          5,
          210,
          5,
          2,
          5,
        ],
        [
          "current",
          "gemini.google.com",
          "/stores",
          1,
          2,
          0,
          0,
          30,
          1,
          1,
          1,
          1,
          2,
          0,
          0,
          30,
          1,
          1,
          1,
        ],
        [
          "previous",
          "chatgpt.com",
          "/stores",
          4,
          6,
          1,
          2,
          100,
          4,
          2,
          4,
          4,
          6,
          1,
          2,
          100,
          4,
          2,
          4,
        ],
      ],
      ["demo requested", "account created"],
    );

    expect(aggregated.totals).toEqual({
      sessions: 6,
      pageviews: 12,
      convertingSessions: 3,
      conversions: 5,
      conversionRate: 0.5,
      averageSessionDurationSeconds: 40,
      bounceRate: 0.5,
    });
    expect(aggregated.previousPeriod).toEqual({
      sessions: 4,
      pageviews: 6,
      convertingSessions: 1,
      conversions: 2,
      conversionRate: 0.25,
      averageSessionDurationSeconds: 25,
      bounceRate: 0.5,
    });
    expect(aggregated.sources[0]).toMatchObject({
      domain: "chatgpt.com",
      sessions: 5,
      pageviews: 10,
      convertingSessions: 3,
      conversions: 5,
      conversionRate: 0.6,
      averageSessionDurationSeconds: 42,
      bounceRate: 0.4,
    });
  });

  it("does not synthesize conversion metrics when no success events are configured", () => {
    const aggregated = aggregatePostHogAiReferralRows(
      [
        [
          "current",
          "chatgpt.com",
          "/stores",
          2,
          3,
          0,
          0,
          60,
          2,
          1,
          2,
          2,
          3,
          0,
          0,
          60,
          2,
          1,
          2,
        ],
      ],
      [],
    );

    expect(aggregated.totals).toMatchObject({
      sessions: 2,
      convertingSessions: null,
      conversions: null,
      conversionRate: null,
    });
    expect(aggregated.sources[0]).toMatchObject({
      convertingSessions: null,
      conversions: null,
      conversionRate: null,
    });
  });

  it("marks matching citation landing paths without claiming attribution", () => {
    const data = attachTrackedCitations(
      {
        period: "30d",
        siteHost: "example.com",
        successEvents: ["demo requested"],
        totals: {
          sessions: 5,
          pageviews: 8,
          convertingSessions: 2,
          conversions: 2,
          conversionRate: 0.4,
          averageSessionDurationSeconds: 30,
          bounceRate: 0.2,
        },
        previousPeriod: {
          sessions: 0,
          pageviews: 0,
          convertingSessions: 0,
          conversions: 0,
          conversionRate: null,
          averageSessionDurationSeconds: null,
          bounceRate: null,
        },
        sources: [
          {
            domain: "chatgpt.com",
            label: "ChatGPT",
            sessions: 5,
            pageviews: 8,
            convertingSessions: 2,
            conversions: 2,
            conversionRate: 0.4,
            averageSessionDurationSeconds: 30,
            bounceRate: 0.2,
            landingPages: [
              {
                path: "/guide/",
                sessions: 3,
                pageviews: 5,
                convertingSessions: 2,
                conversions: 2,
                conversionRate: 2 / 3,
                averageSessionDurationSeconds: 40,
                bounceRate: 0,
                trackedCitationCount: 0,
              },
              {
                path: "/pricing",
                sessions: 2,
                pageviews: 3,
                convertingSessions: 0,
                conversions: 0,
                conversionRate: 0,
                averageSessionDurationSeconds: 15,
                bounceRate: 0.5,
                trackedCitationCount: 0,
              },
            ],
          },
        ],
        citedLandingPageSessions: 0,
        trackedCitationCount: 0,
        queriedAt: "2026-08-26T12:00:00.000Z",
        cached: false,
      },
      [
        "https://www.example.com/guide?utm_source=test",
        "https://example.com/guide/#section",
        "https://competitor.example/pricing",
      ],
    );

    expect(data.trackedCitationCount).toBe(2);
    expect(data.citedLandingPageSessions).toBe(3);
    expect(data.sources[0]?.landingPages[0]?.trackedCitationCount).toBe(2);
    expect(data.sources[0]?.landingPages[1]?.trackedCitationCount).toBe(0);
  });

  it("keeps the personal key server-side and parses the production response wrapper", async () => {
    const calls: Array<Parameters<typeof fetch>> = [];
    const fetchImpl: typeof fetch = async (...arguments_) => {
      calls.push(arguments_);
      return new Response(
        JSON.stringify({
          results: [
            [
              "current",
              "chatgpt.com",
              "/stores",
              2,
              3,
              1,
              2,
              60,
              2,
              1,
              2,
              2,
              3,
              1,
              2,
              60,
              2,
              1,
              2,
            ],
          ],
          is_cached: true,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const result = await fetchPostHogAiReferrals({
      environment: {
        POSTHOG_HOST: "https://eu.posthog.com",
        POSTHOG_PROJECT_ID: "123",
        POSTHOG_PERSONAL_API_KEY: "phx_secret",
        POSTHOG_SUCCESS_EVENTS: "demo requested, account created",
      },
      website: "https://example.com",
      period: "7d",
      fetchImpl,
    });

    expect(calls).toHaveLength(1);
    const [url, request] = calls[0]!;
    expect(url).toBe("https://eu.posthog.com/api/projects/123/query/");
    expect(request?.headers).toMatchObject({
      Authorization: "Bearer phx_secret",
    });
    expect(request?.body).not.toContain("phx_secret");
    expect(result).toMatchObject({
      period: "7d",
      siteHost: "example.com",
      successEvents: ["demo requested", "account created"],
      totals: {
        sessions: 2,
        pageviews: 3,
        convertingSessions: 1,
        conversions: 2,
        conversionRate: 0.5,
      },
      cached: true,
    });
  });
});
