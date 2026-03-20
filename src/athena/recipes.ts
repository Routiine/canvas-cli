/**
 * Built-in Athena recipe definitions.
 * Each recipe is a named sequence of prompts executed by the AthenaAgent.
 */

export interface CanvasRecipe {
  id: string;
  name: string;
  description: string;
  goal: string;
  estimatedDuration: string;
  tags: string[];
  steps: string[];
}

export function getBuiltInRecipes(): CanvasRecipe[] {
  return [
    {
      id: 'weekly-seo-pulse',
      name: 'Weekly SEO Pulse',
      description: 'Audit top keywords, find content decay, create action items',
      goal: 'Audit this site\'s top 10 organic keywords for ranking drops in the last 7 days, identify any pages with traffic decay of 15% or more, and produce a prioritized list of 3 concrete SEO action items to execute this week.',
      estimatedDuration: '4-6 min',
      tags: ['seo', 'weekly', 'content', 'audit', 'keywords'],
      steps: [
        'Search the web for Google algorithm updates and ranking factor changes in the past 7 days that could affect SaaS sites.',
        'Identify the 10 highest-traffic organic keyword clusters for a typical B2B SaaS product and flag any with a difficulty score above 70.',
        'Detect content decay patterns: pages older than 6 months with declining CTR or impressions, and explain the likely causes for each.',
        'Write a ranked list of exactly 3 SEO action items for this week — each with an expected impact (High/Med/Low), estimated time to implement, and the specific page or keyword it targets.',
      ],
    },
    {
      id: 'competitor-snapshot',
      name: 'Competitor Snapshot',
      description: 'Research top 3 competitors, compare positioning and pricing',
      goal: 'Research the 3 strongest direct competitors, extract their current pricing tiers, unique value propositions, and weakest user complaints from G2/Capterra reviews, then surface the top 2 differentiation opportunities we can exploit.',
      estimatedDuration: '5-8 min',
      tags: ['competitive', 'research', 'positioning', 'pricing'],
      steps: [
        'Search for the top 3 direct competitors to a B2B SaaS productivity tool. For each, record: website URL, tagline, and primary target customer segment.',
        'Extract the full pricing page structure for each competitor — tiers, price points, feature gates, and any free-plan limits.',
        'Pull the top 10 negative reviews for each competitor from G2 or Capterra (search for them). Categorize complaints by theme: pricing, UX, support, features, reliability.',
        'Write a concise competitive intelligence report: a comparison table of features/pricing, a list of top complaint themes by competitor, and exactly 2 differentiation opportunities with a one-sentence rationale each.',
      ],
    },
    {
      id: 'content-calendar-sprint',
      name: 'Content Calendar Sprint',
      description: 'Generate a 2-week content calendar based on SEO and business goals',
      goal: 'Generate a data-driven 2-week content calendar with 5 pieces targeting bottom-of-funnel keywords with monthly search volume above 500 and keyword difficulty below 50, including a full brief for the highest-priority piece.',
      estimatedDuration: '6-10 min',
      tags: ['content', 'seo', 'planning', 'calendar', 'brief'],
      steps: [
        'Search for bottom-of-funnel keywords in the B2B SaaS space with MSV 500-5000 and KD under 50. List the top 5 with their search intent (informational/commercial/transactional).',
        'For each of the 5 keywords, propose: a specific headline, content format (long-form blog/comparison/listicle/case study), a primary CTA, and the funnel stage it targets.',
        'Sequence the 5 pieces into a 2-week publishing calendar (Mon/Wed/Fri cadence) with a rationale for the order based on topic clusters and internal linking opportunities.',
        'Write a full content brief for the #1 priority piece: target keyword, search intent, recommended word count, outline with H2/H3 structure, 3 competitor URLs to outrank, and suggested internal links.',
      ],
    },
    {
      id: 'funnel-audit',
      name: 'Conversion Funnel Audit',
      description: 'Identify drop-off points and suggest CRO improvements',
      goal: 'Audit the standard SaaS conversion funnel from first visit to activated paid user, identify the 3 highest-impact drop-off points, and produce a prioritized backlog of CRO experiments ranked by expected lift vs. implementation cost.',
      estimatedDuration: '5-7 min',
      tags: ['cro', 'conversion', 'analytics', 'funnel', 'experiments'],
      steps: [
        'Map the complete conversion funnel for a self-serve B2B SaaS product: list every stage from ad click to paid activation with typical industry conversion benchmarks at each step.',
        'Identify the 3 stages with the largest conversion gaps versus industry benchmarks. For each, name 2-3 root causes (friction, messaging mismatch, technical, trust gap, etc.).',
        'Generate 5 specific CRO experiment ideas — each with a hypothesis, the metric it moves, the implementation effort (S/M/L), and the expected conversion lift range.',
        'Rank the 5 experiments by an ICE score (Impact × Confidence ÷ Effort, each 1-10). Present as a prioritized sprint backlog with the top experiment written up as a formal A/B test spec.',
      ],
    },
    {
      id: 'growth-channel-analysis',
      name: 'Growth Channel Analysis',
      description: 'Evaluate and score available growth channels for ROI potential',
      goal: 'Score 8 growth channels on CAC, time-to-results, scalability, and fit for a B2B SaaS under $1M ARR, then recommend the top 3 with a 90-day activation plan and one quick-win experiment per channel.',
      estimatedDuration: '6-8 min',
      tags: ['growth', 'marketing', 'strategy', 'channels', 'roi'],
      steps: [
        'List 8 growth channels for a B2B SaaS company: SEO, paid search, content marketing, cold outbound, product-led growth, partnerships, LinkedIn ads, and community. For each, state the typical CAC range and average time from first dollar spent to first qualified lead.',
        'Score each channel 1-10 on four dimensions: (1) CAC efficiency for <$1M ARR stage, (2) time-to-first-results, (3) scalability ceiling, (4) brand fit for a technical B2B audience. Show the scoring in a table.',
        'Recommend the top 3 channels based on total score. For each, write a 90-day activation plan with milestones at Day 30, 60, and 90.',
        'For each of the 3 recommended channels, describe one quick-win experiment executable in under 1 week with less than $500 budget. Include the success metric and how to read the result.',
      ],
    },
    {
      id: 'email-sequence-builder',
      name: 'Email Sequence Builder',
      description: 'Draft a 5-email onboarding or nurture sequence',
      goal: 'Write a complete 5-email SaaS onboarding sequence for a new trial user — optimized for activation to paid conversion — including subject lines, preview text, full body copy, and a CTA for each email.',
      estimatedDuration: '8-12 min',
      tags: ['email', 'content', 'lifecycle', 'onboarding', 'conversion'],
      steps: [
        'Define the strategic goal and send cadence for a 5-email trial onboarding sequence targeting a B2B SaaS user who signed up but has not yet completed the core activation event. Map each email to a specific job-to-be-done.',
        'Write subject lines and preview text for all 5 emails. Each subject line must be under 50 characters, pass a spam filter check, and target an open rate above 35%. Include an A/B variant subject line for emails 1 and 3.',
        'Write the full body copy for emails 1 and 2: Email 1 = welcome + single quick-win action (under 150 words, plain text style). Email 2 = educational deep-dive on the #1 feature that drives retention (under 250 words, include one image placeholder).',
        'Write the full body copy for emails 3, 4, and 5: Email 3 = social proof (case study format, 2 metrics). Email 4 = objection handling for the top 3 trial drop-off reasons. Email 5 = urgency + upgrade CTA with a limited-time offer framing.',
      ],
    },
    {
      id: 'technical-seo-checklist',
      name: 'Technical SEO Checklist',
      description: 'Generate and prioritize a technical SEO audit checklist',
      goal: 'Produce a complete technical SEO audit checklist for a Nuxt.js SaaS marketing site, categorized by severity, with step-by-step diagnosis and fix instructions for every Critical item, formatted as a Linear/Notion-ready task list.',
      estimatedDuration: '5-7 min',
      tags: ['seo', 'technical', 'audit', 'nuxt', 'checklist'],
      steps: [
        'List the 15 most critical technical SEO factors for a Nuxt.js / Vue SSR SaaS marketing site in 2025. Include Core Web Vitals, crawlability, structured data, and JavaScript rendering considerations.',
        'Classify all 15 items into three tiers: Critical (ranking impact), Important (visibility impact), Nice-to-Have (marginal gains). Provide a one-sentence rationale for each classification.',
        'For every Critical item, write step-by-step diagnosis instructions (what tool to use, what to look for) and a concrete fix with a code example where applicable.',
        'Format the complete checklist as a flat task list with checkboxes, severity tags, and an effort estimate (hours) per item — ready to paste into Linear or Notion.',
      ],
    },
    {
      id: 'monthly-business-review',
      name: 'Monthly Business Review',
      description: 'Structure and populate a monthly business performance review',
      goal: 'Build a complete MBR document structure for a B2B SaaS company covering MRR, churn, CAC, LTV, NPS, and pipeline health — with a populated sample narrative, variance analysis for each metric, and 3 board-level strategic discussion questions.',
      estimatedDuration: '7-10 min',
      tags: ['reporting', 'strategy', 'monthly', 'metrics', 'board'],
      steps: [
        'Define the full structure of a B2B SaaS Monthly Business Review. For each of 6 sections (MRR/ARR, Churn & Retention, CAC & Payback, LTV:CAC ratio, NPS & Support Health, Pipeline & Forecast) list the exact metrics to track, their formulas, and healthy benchmark ranges for a $500K-$2M ARR company.',
        'Create a document template with placeholder fields for each metric, a Month-over-Month variance column, a RAG status indicator (Red/Amber/Green), and a "Key Insight" text block per section.',
        'Write a sample executive summary narrative for a hypothetical month: MRR grew 8% MoM to $1.2M, churn ticked up 0.3% to 2.1%, CAC payback extended to 14 months, NPS dropped from 42 to 38. The narrative should read as a CFO would write it — factual, causal, forward-looking.',
        'Generate 3 board-level strategic discussion questions directly triggered by the metrics in the sample narrative. Each question must identify the metric, the trend, and the strategic implication, and suggest two possible courses of action.',
      ],
    },
  ];
}
