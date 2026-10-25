"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { excerpt, selectSectionArticles, SECTIONS, type Article, type Lens, type NewsPayload, type SectionId } from "@/lib/news";
import type { UpcomingEvent } from "@/lib/events";
import { buildPerspectiveClusters, consequenceFor, storyParagraphs, type PerspectiveCluster } from "@/lib/editorial";
import { EntityText } from "@/components/EntityText";

const TIME_ZONE = "America/Detroit";

function formatEdition(value: string, long = false) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    ...(long
      ? { weekday: "long", month: "long", day: "numeric", year: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" }),
  }).format(new Date(value));
}

function formatEditionDate(value: string, long = false) {
  return formatEdition(`${value}T12:00:00Z`, long);
}

const EVIDENCE: Record<Lens, string> = {
  wire: "A wire report is used as the factual baseline, although details can still change as documents emerge and reporting develops.",
  "left-framing": "This is left-leaning framing rather than neutral ground truth, so its emphasis should be compared with wire reporting and primary records.",
  "right-framing": "This is right-leaning framing rather than neutral ground truth, so its emphasis should be compared with wire reporting and primary records.",
  local: "The local newsroom is close to the story; its original report should be consulted for documents, interviews, and subsequent corrections or updates.",
  tracker: "This item was discovered through Google News, while the named publisher remains responsible for the underlying reporting and evidence.",
  technology: "Product claims and company benchmarks remain claims until they are independently tested or supported by primary documentation.",
  trade: "Credible trade reporting is useful, but it is kept distinct from a formal announcement by a studio, network, or streamer.",
  official: "The source confirms that an institution announced or took an action; it does not independently prove every broader claim made around that action.",
};

const SECTION_READING: Record<SectionId, { opening: string; close: string }> = {
  global: {
    opening: "Each global item begins with wire reporting, then returns to the same development in CNN and Fox coverage when a close topical match is available.",
    close: "The comparison is useful when it reveals different priorities without allowing either frame to replace documents, direct evidence, or the factual baseline.",
  },
  national: {
    opening: "Each national item establishes the central facts through wire reporting before examining how CNN and Fox describe that same federal or nationwide development.",
    close: "The point is not to manufacture symmetry, but to identify what each perspective foregrounds, what it leaves less visible, and which claims still need primary evidence.",
  },
  michigan: {
    opening: "Michigan coverage is selected for statewide consequence rather than volume, with attention to government, schools, elections, infrastructure, and the economy.",
    close: "Watch for enacted policy, appropriated money, agency guidance, and local implementation, because those are the points where a statewide headline becomes a material change.",
  },
  detroit: {
    opening: "The Detroit report concentrates on decisions and conditions that residents can feel in neighborhoods, public institutions, transportation, housing, and city government.",
    close: "The strongest follow-up will measure who receives the benefit, who bears the cost, and whether public commitments are visible in budgets, contracts, and neighborhood outcomes.",
  },
  "warren-macomb": {
    opening: "The Warren and Macomb desk stays deliberately narrow: a story belongs here only when it has a plausible effect on local services, safety, schools, taxes, or development.",
    close: "Local significance should be judged through meeting records, agency documents, implementation dates, and consequences that residents can verify in daily life.",
  },
  lansing: {
    opening: "This desk follows the civic and institutional life of Lansing and East Lansing, including city government, Michigan State University, development, and public safety.",
    close: "The next step is to compare announcements with votes, timelines, funding, and implementation across the city and university communities.",
  },
  abdul: {
    opening: "Coverage of Abdul El-Sayed is limited to substantive campaign, policy, endorsement, fundraising, and accountability developments rather than personality-driven political chatter.",
    close: "The durable questions are what policy is being proposed, what governing record supports it, who is building the coalition, and what verifiable evidence separates momentum from campaign messaging.",
  },
  mamdani: {
    opening: "Coverage of Zohran Mamdani focuses on consequential proposals, government actions, coalition politics, and accountability rather than the daily churn of personality coverage.",
    close: "The meaningful test is whether rhetoric becomes an administratively workable decision with a budget, legal authority, implementation plan, and measurable public result.",
  },
  technology: {
    opening: "The technology report favors changes with technical or market consequence across products, platforms, security, infrastructure, and the computing industry.",
    close: "Treat launch claims as provisional until independent tests, technical documentation, adoption data, and real-world reliability show what has actually changed.",
  },
  ai: {
    opening: "The AI desk ranks consequential model releases, product changes, research, policy, safety, investment and useful emerging tools, with direct coverage of OpenAI, ChatGPT, Anthropic, Claude and TypeSafe’s Jev when material developments occur.",
    close: "Official announcements establish what a lab says it shipped; independent reporting, documentation, benchmarks and real-world use determine whether the development matters.",
  },
  "screen-cinema": {
    opening: "Screen and cinema coverage is limited to material developments in Hollywood movies, excluding television, celebrity profiles, awards chatter, promotional appearances, and non-Hollywood film industries.",
    close: "A project becomes more concrete when financing, production, casting, distribution, or a release commitment is documented; until then, the wording of the source matters.",
  },
  "good-news": {
    opening: "This is not a collection of uplifting anecdotes. It is a record of measurable progress supported by implementation, funding, approval, treatment, or documented improvements in human well-being.",
    close: "Good news remains accountable news, so the important follow-up is whether the intervention reaches people at scale and whether independent measurement confirms the promised benefit.",
  },
};

function sourceNames(articles: Article[]) {
  const names = [...new Set(articles.map((article) => article.source))];
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
}

function oneSentenceQuote(value: string, words: number) {
  const shortened = excerpt(value, words).replace(/\s+/g, " ").trim();
  const firstSentence = [...new Intl.Segmenter("en", { granularity: "sentence" }).segment(shortened)][0]?.segment.trim() || shortened;
  return firstSentence.replace(/[.!?…]+$/u, "");
}

function ReportStory({ article }: { article: Article }) {
  const factualParagraphs = storyParagraphs(article);
  const sourceUrl = article.sourceUrl ?? article.url;
  return (
    <article className="story-article">
      <header className="story-heading">
        <p>{article.source} · {article.publishedAt ? formatEdition(article.publishedAt) : "Date unavailable"}</p>
        <h3><EntityText text={article.title} /></h3>
      </header>
      {factualParagraphs.length ? factualParagraphs.map((paragraph, index) => (
        <p key={`${article.id}-fact-${index}`}><EntityText text={paragraph} /> <a className="source-citation" href={sourceUrl} target="_blank" rel="noreferrer">{article.source}</a></p>
      )) : <p>The linked feed supplied a headline but no usable article facts. The edition therefore does not turn that headline into ersatz reporting. No additional claims are inferred from the headline alone. The item remains linked so readers can check the publisher for fuller reporting or updates. <a className="source-citation" href={sourceUrl} target="_blank" rel="noreferrer">Read the source report.</a></p>}
      <p>{consequenceFor(article)} That is the central reason this item matters. The effects will depend on implementation, adoption, and the response of affected institutions. Further reporting should test the announcement or event against measurable outcomes.</p>
      <p>{EVIDENCE[article.lens]} The item was selected for consequence and source quality rather than because it appeared first in the feed. This edition does not treat publication by itself as proof of every claim. New documents, corrections, or additional reporting may change this assessment.</p>
    </article>
  );
}

function PerspectiveStory({ cluster }: { cluster: PerspectiveCluster }) {
  const { anchor, wireSupport, left, right } = cluster;
  const quote = (article: Article) => oneSentenceQuote(article.content || article.description || article.title, 22);
  const apArticle = [anchor, wireSupport].find((article) => article?.source === "AP News");
  const factualParagraphs = storyParagraphs(anchor);
  const anchorUrl = anchor.sourceUrl ?? anchor.url;
  return (
    <article className="story-article story-article--headline">
      <header className="story-heading">
        <p>{anchor.source} · {anchor.publishedAt ? formatEdition(anchor.publishedAt) : "Date unavailable"}</p>
        <h3><EntityText text={anchor.title} /></h3>
      </header>
      {factualParagraphs.length ? factualParagraphs.map((paragraph, index) => (
        <p key={`${anchor.id}-fact-${index}`}><EntityText text={paragraph} /> <a className="source-citation" href={anchorUrl} target="_blank" rel="noreferrer">{anchor.source}</a></p>
      )) : <p>The source feed supplied only a headline for this item. No independently extracted body text was available, so no additional event details are asserted here. The linked publisher remains the authoritative place to read its reporting and any updates. The headline is retained only to identify the item without inventing supporting details. <a className="source-citation" href={anchorUrl} target="_blank" rel="noreferrer">Read the source report.</a></p>}
      <p>{consequenceFor(anchor)} This consequence, not feed position, is why the story ranks among the leading reports. The eventual effects will depend on implementation and the response of affected governments, institutions, or communities. Follow-up reporting should compare stated intentions with observable results.</p>
      {wireSupport && <p>A second wire account from <a className="source-citation" href={wireSupport.sourceUrl ?? wireSupport.url} target="_blank" rel="noreferrer">{wireSupport.source}</a> reports, <q><EntityText text={quote(wireSupport)} /></q>. The overlap strengthens confidence in the core event. The accounts may still differ in timing, emphasis, or available evidence. Contested details should be checked against both reports and later updates.</p>}
      {left && <p>In closely related coverage, <a className="source-citation" href={left.sourceUrl ?? left.url} target="_blank" rel="noreferrer">{left.source}</a> emphasizes, <q><EntityText text={quote(left)} /></q>. That framing shows which consequences or constituencies the outlet places near the center of the story. It remains an interpretation rather than a substitute for documents or direct evidence. Its emphasis should be compared with the baseline report.</p>}
      {right && <p>The right-leaning frame in <a className="source-citation" href={right.sourceUrl ?? right.url} target="_blank" rel="noreferrer">{right.source}</a> emphasizes, <q><EntityText text={quote(right)} /></q>. That choice indicates which institutions, risks, or political stakes the outlet considers most important. It remains an interpretation rather than an independent factual baseline. Its emphasis should be compared with the wire account and primary evidence.</p>}
      <p>{EVIDENCE[anchor.lens]} The principal report{apArticle ? " from AP News" : ""} was published {anchor.publishedAt ? formatEdition(anchor.publishedAt) : "without a usable feed date"}. Publication time helps establish sequence, but it does not by itself establish truth or importance. New documents, corrections, or reporting may alter the assessment.</p>
    </article>
  );
}

function EditionSection({ section, articles }: { section: (typeof SECTIONS)[number]; articles: Article[] }) {
  const reading = SECTION_READING[section.id];
  const comparesPerspectives = section.id === "global" || section.id === "national";
  const clusters = comparesPerspectives ? buildPerspectiveClusters(articles) : [];
  const citedArticles = comparesPerspectives
    ? clusters.flatMap(({ anchor, wireSupport, left, right }) => [anchor, wireSupport, left, right].filter((article): article is Article => Boolean(article)))
    : articles;
  const hasReport = comparesPerspectives ? clusters.length > 0 : articles.length > 0;
  return (
    <section className={`edition-section edition-section--${section.id}`} id={section.id} aria-labelledby={`${section.id}-heading`}>
      <header className="section-heading">
        <p>Section {String(SECTIONS.findIndex((item) => item.id === section.id) + 1).padStart(2, "0")}</p>
        <div><h2 id={`${section.id}-heading`}><EntityText text={section.label} /></h2><p>{section.dek}</p></div>
        <a href="#top">Back to Top ↑</a>
      </header>
      {hasReport ? (
        <div className="story-list">
          <p className="section-introduction">{reading.opening} The desk evaluated {citedArticles.length} cited reports from {sourceNames(citedArticles)}, then ranked developments by consequence, source quality, and corroboration rather than feed order.</p>
          {comparesPerspectives
            ? clusters.map((cluster) => <PerspectiveStory key={cluster.anchor.id} cluster={cluster} />)
            : articles.map((article) => <ReportStory key={article.id} article={article} />)}
        </div>
      ) : (
        <article className="section-essay section-essay--quiet">
          <p>{reading.opening}</p>
          <p>No consequential item cleared this desk’s source and relevance thresholds in the current edition. Leaving the space quiet is more useful than filling it with a weakly sourced or marginal story.</p>
          <p>{reading.close}</p>
        </article>
      )}
    </section>
  );
}

function formatEventDate(event: UpcomingEvent): string {
  const source = event.startLocal ?? event.startIso;
  if (!source) return "Date to be announced";
  const date = new Date(/\dT\d/.test(source) ? source : `${source}Z`);
  if (Number.isNaN(date.getTime())) return "Date to be announced";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function UpcomingEventsSection({ events }: { events: UpcomingEvent[] }) {
  if (!events.length) return null;
  return (
    <section id="upcoming-events" className="upcoming-events">
      <header>
        <p className="kicker">Upcoming at Burgess Institute</p>
        <h2>Events</h2>
        <p className="dek">Innovate State panels, career fairs, and MSU founder programming hosted by the Burgess Institute for Entrepreneurship. Tickets open on Eventbrite.</p>
      </header>
      <ul className="event-list">
        {events.map((event) => (
          <li key={event.id} className="event-card">
            <p className="event-when">{formatEventDate(event)}</p>
            <h3><a href={event.url} rel="noopener noreferrer" target="_blank">{event.name}</a></h3>
            <p className="event-meta">{[event.isOnline ? "Online" : event.venue, event.isFree ? "Free" : null].filter(Boolean).join(" · ")}</p>
            {event.summary && <p className="event-summary">{event.summary}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function Newsroom({ initial, editionDate, editionKind }: { initial: NewsPayload; editionDate: string; editionKind: "today" | "yesterday" }) {
  const [data, setData] = useState(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const healthy = data.sources.filter((source) => source.ok).length;
  const grouped = useMemo(() => new Map(SECTIONS.map((section) => [section.id, selectSectionArticles(data.articles, section.id, section.limit)])), [data]);
  const displayed = [...grouped.entries()].reduce((sum, [category, items]) => {
    if (category === "global" || category === "national") {
      return sum + buildPerspectiveClusters(items).reduce((count, cluster) => count + 1 + Number(Boolean(cluster.wireSupport)) + Number(Boolean(cluster.left)) + Number(Boolean(cluster.right)), 0);
    }
    return sum + items.length;
  }, 0);

  async function refresh() {
    setRefreshing(true);
    setError("");
    try {
      const response = await fetch(`/api/news?t=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Refresh failed");
      setData(await response.json());
    } catch {
      setError("The live refresh did not complete. This saved edition remains readable; try again shortly.");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div id="top">
      <a className="skip" href="#edition">Skip to Today’s Edition</a>
      <header className="site-header">
        <div className="utility-row">
          <span>{formatEditionDate(editionDate, true)}</span>
          <span>Personal Morning Edition</span>
          <span>Detroit · Lansing</span>
        </div>
        <div className="masthead-row">
          <p>Facts first.<br />Framing labeled.</p>
          <div><h1>The Daily Bread</h1><p>A personalized newspaper for what is worth knowing</p></div>
          {editionKind === "today"
            ? <button onClick={refresh} disabled={refreshing} aria-live="polite" aria-busy={refreshing}>{refreshing ? "Refreshing…" : "Refresh Edition"}</button>
            : <Link className="return-today" href="/">Return to Today</Link>}
        </div>
        <div className="edition-line">
          <span>{displayed} reports synthesized</span><strong>Long-form daily reading</strong><span>{healthy}/{data.sources.length} desks reporting</span>
        </div>
        <nav className="edition-picker" aria-label="Choose edition">
          <Link href="/" aria-current={editionKind === "today" ? "page" : undefined}>Today’s Edition</Link>
          <Link href="/?edition=yesterday" aria-current={editionKind === "yesterday" ? "page" : undefined}>Yesterday’s Edition</Link>
        </nav>
        <nav className="section-nav" aria-label="Today’s sections">
          {(data.upcomingEvents?.length ?? 0) > 0 && <a href="#upcoming-events">Upcoming Events</a>}
          {SECTIONS.map((section) => <a key={section.id} href={`#${section.id}`}>{section.label.replace(" Tracker", "")}</a>)}
        </nav>
      </header>

      <main id="edition">
        <div className="editor-note" aria-labelledby="editor-note-heading">
          <p className="kicker">Editor’s Note</p>
          <h2 id="editor-note-heading">One Page. The Whole Day.</h2>
          <p>Each desk ranks candidate reports for consequence, source quality, and corroboration instead of publishing the first feed item. Every selected story receives its own headline and three-to-nine-paragraph article, with four-to-six complete sentences in each paragraph and AP and Reuters checked for headline significance where applicable.</p>
        </div>

        {error && <p className="refresh-error" role="status">{error}</p>}

        <UpcomingEventsSection events={data.upcomingEvents ?? []} />

        {SECTIONS.map((section) => <EditionSection key={section.id} section={section} articles={grouped.get(section.id) ?? []} />)}

        <aside className="source-system" id="method" aria-labelledby="method-heading">
          <header><p className="kicker">Transparent by Design</p><h2 id="method-heading">How This Edition Is Sourced</h2></header>
          <div className="method-copy">
            <p>AP and Reuters establish the broad factual baseline when suitable feeds are available. CNN and Fox News Digital are read for contrasting political framing, while Bridge Michigan, Michigan Public, BridgeDetroit, WDET, City Pulse, East Lansing Info, and other local publishers supply reporting closest to Michigan communities.</p>
            <p>Technology coverage draws from specialist newsrooms such as The Verge, Ars Technica, and TechCrunch, while Hollywood movie coverage relies on film-specific feeds from established trades including Variety, Deadline, and The Hollywood Reporter. Official government, public-health, campaign, and company pages establish that an announcement or action occurred; they do not independently verify every claim inside it.</p>
            <p>Quoted language is intentionally brief and comes from publisher-provided feed text or headlines. Every attribution links to the full original report, where the publisher’s complete context, evidence, corrections, and reporting belong.</p>
          </div>
        </aside>

        <details className="newsroom-status">
          <summary>Newsroom Status <span>{healthy} live · {data.sources.length - healthy} unavailable</span></summary>
          <div className="health-grid">
            {data.sources.map((source) => (
              <p key={`${source.source}-${source.category}`}><span className={source.ok ? "health-dot health-dot--live" : "health-dot"} /><strong>{source.source}</strong><span>{source.method}</span><span>{source.ok ? `${source.count} items` : source.error || "Unavailable"}</span></p>
            ))}
          </div>
        </details>
      </main>

      <footer><div><strong>The Daily Bread</strong><p>Updated throughout the day and warmed every morning. Brief quotations, headlines, and images remain the property of their publishers.</p></div><a href="#top">Return to Front Page ↑</a></footer>
    </div>
  );
}
