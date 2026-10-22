import {
  DEFAULT_SETTINGS,
  type AutomationSettings,
  type Graph,
  type GraphEdge,
  type GraphNode,
  type Language,
  type EmailConfig,
  type NodeConfigs,
  type NodeKind,
  type TaskConfig,
  type PortId,
  type SubjectKind,
  type Trigger,
} from "../../../lib/domain/automations";

type Copy = { description: string; graph: Graph };

/** English is the template itself; the other languages swap in their own description and emails. */
export type AutomationTemplate = Copy & {
  key: string;
  name: string;
  subjectKind: SubjectKind;
  trigger: Trigger;
  settings: AutomationSettings;
  variants: Partial<Record<Exclude<Language, "en">, Copy>>;
};

const STEP = 190;
const SPREAD = 210;
const WIDTH = 320;

type Spec = {
  id: string;
  kind: NodeKind;
  /** Column: 0 main, -1 left (yes/met), 1 right (no/timeout). */
  col?: number;
  row: number;
  config?: NodeConfigs[NodeKind];
  from?: [string, PortId];
};

function build(specs: Spec[]): Graph {
  const nodes: GraphNode[] = specs.map((spec) => ({
    id: spec.id,
    kind: spec.kind,
    x: (spec.col ?? 0) * SPREAD * 1.1 - WIDTH / 2,
    y: spec.row * STEP,
    config: (spec.config ?? {}) as Record<string, unknown>,
  }));
  const edges: GraphEdge[] = specs
    .filter((spec) => spec.from)
    .map((spec) => ({
      id: `${spec.from![0]}-${spec.from![1]}-${spec.id}`,
      source: spec.from![0],
      port: spec.from![1],
      target: spec.id,
    }));
  return { nodes, edges };
}

const FUNDED = {
  field: "platform.event",
  op: "happened" as const,
  value: ["wallet.topup_succeeded", "wallet.deposit_received"],
};

const REGISTERED = {
  field: "platform.event",
  op: "happened" as const,
  value: ["organization.created"],
};

const LEAD_DONE = {
  field: "lead.status",
  op: "is" as const,
  value: ["qualified", "nurture", "disqualified", "converted"],
};

type Step = Pick<Spec, "kind" | "config">;

const GREETING: Record<Language, string> = {
  en: "Hi {{person.firstName|there}},",
  hinglish: "Hi {{person.firstName|there}},",
  hi: "नमस्ते {{person.firstName|जी}},",
};
const SIGN_OFF: Record<Language, string> = {
  en: "{{owner.firstName|The Hypedrive team}}",
  hinglish: "{{owner.firstName|Team Hypedrive}}",
  hi: "{{owner.firstName|Hypedrive टीम}}",
};

const email = (
  subject: string,
  text: string,
  language: Language = "en",
): Step => ({
  kind: "send_email",
  config: {
    subject,
    body: `${GREETING[language]}\n\n${text}\n\n${SIGN_OFF[language]}`,
    purpose: "sales_outreach",
  } satisfies EmailConfig,
});

const wait = (amount: number, unit: "hours" | "days" = "days"): Step => ({
  kind: "wait",
  config: { mode: "duration", amount, unit },
});

const task = (title: string, notes: string): Step => ({
  kind: "create_task",
  config: {
    title,
    notes,
    assignee: "owner",
    dueInDays: 0,
    priority: "high",
  } satisfies TaskConfig,
});

function sequence(steps: Step[]): Graph {
  return build([
    { id: "trigger", kind: "trigger", row: 0 },
    ...steps.map((step, index) => ({
      ...step,
      id: `step-${index + 1}`,
      row: index + 1,
      from: [index ? `step-${index}` : "trigger", "out"] as [string, PortId],
    })),
  ]);
}

type Mail = [subject: string, text: string];
type Translation = { description: string; emails: Mail[] };

type Definition = Omit<AutomationTemplate, "graph" | "variants"> & {
  steps: Step[];
  /** Emails in step order; tasks and waits are shared with English, since the owner reads those. */
  translations: Partial<Record<Exclude<Language, "en">, Translation>>;
};

function define({ steps, translations, ...rest }: Definition) {
  const variants: AutomationTemplate["variants"] = {};
  for (const [language, copy] of Object.entries(translations) as [
    Exclude<Language, "en">,
    Translation,
  ][]) {
    let next = 0;
    variants[language] = {
      description: copy.description,
      graph: sequence(
        steps.map((step) =>
          step.kind === "send_email"
            ? email(...copy.emails[next++], language)
            : step,
        ),
      ),
    };
  }
  return {
    ...rest,
    graph: sequence(steps),
    variants,
  } satisfies AutomationTemplate;
}

/** The template's content in a language, or English when it has none in that one. */
export function templateIn(
  template: AutomationTemplate,
  language: Language | undefined,
): Copy & { language: Language } {
  const copy = language === "en" ? undefined : template.variants[language!];
  return copy
    ? { ...copy, language: language! }
    : {
        description: template.description,
        graph: template.graph,
        language: "en",
      };
}

export const TEMPLATES: AutomationTemplate[] = [
  define({
    key: "new-lead-follow-up",
    name: "New lead follow-up",
    description:
      "An intro email as soon as a lead comes in, a nudge the next day and a last-call task for the owner on day 3.",
    subjectKind: "lead",
    trigger: { kind: "lead_created" },
    settings: { ...DEFAULT_SETTINGS, goal: [LEAD_DONE] },
    steps: [
      email(
        "Quick hello from Hypedrive",
        "Thanks for your interest in Hypedrive. We help brands selling on marketplaces get genuine reviews and photos from real buyers.\n\nTell me which marketplaces you sell on and roughly how many orders you ship a month, and I'll suggest where to start. Or reply with a time for a short call.",
      ),
      wait(1),
      email(
        "Still interested in Hypedrive?",
        "Just checking my earlier note reached you. If now isn't a good time, tell me when to come back and I will.",
      ),
      wait(2),
      task(
        "Last call: {{record.name}}",
        "Two emails sent and no reply. Call once. If there's no answer, move the lead to Nurture.",
      ),
    ],
    translations: {
      hinglish: {
        description:
          "Lead aate hi intro email, agle din ek nudge aur day 3 par owner ke liye last-call task.",
        emails: [
          [
            "Hypedrive ki taraf se ek chhota sa hello",
            "Hypedrive mein interest dikhane ke liye thank you. Hum marketplaces par bechne wale brands ko real buyers se genuine reviews aur photos dilwane mein help karte hain.\n\nAap bata dijiye ki aap kaun se marketplaces par sell karte hain aur mahine mein lagbhag kitne orders ship karte hain, hum bata denge ki shuruaat kahan se karein. Ya phir ek chhoti call ke liye time bata dijiye.",
          ],
          [
            "Hypedrive mein abhi bhi interest hai?",
            "Bas check kar rahe the ki hamara pichla email aap tak pahuncha ya nahi. Agar abhi sahi time nahi hai, to bata dijiye hum kab dobara contact karein, hum tabhi baat karenge.",
          ],
        ],
      },
      hi: {
        description:
          "लीड आते ही परिचय ईमेल, अगले दिन एक याद दिलाने वाला ईमेल और तीसरे दिन ओनर के लिए आखिरी कॉल का टास्क।",
        emails: [
          [
            "Hypedrive की तरफ से नमस्ते",
            "Hypedrive में रुचि दिखाने के लिए धन्यवाद। हम मार्केटप्लेस पर बेचने वाले ब्रांड्स को असली खरीदारों से भरोसेमंद रिव्यू और फोटो दिलाने में मदद करते हैं।\n\nआप बताइए कि आप किन मार्केटप्लेस पर बेचते हैं और महीने में लगभग कितने ऑर्डर भेजते हैं। हम बता देंगे कि शुरुआत कहाँ से करें। या छोटी कॉल के लिए कोई समय बता दीजिए।",
          ],
          [
            "क्या आपको अब भी Hypedrive में रुचि है?",
            "बस देखना था कि हमारा पिछला ईमेल आप तक पहुँचा या नहीं। अगर अभी सही समय नहीं है, तो बता दीजिए कि कब दोबारा संपर्क करें। हम तभी बात करेंगे।",
          ],
        ],
      },
    },
  }),
  define({
    key: "demo-no-show",
    name: "Demo no-show re-book",
    description:
      "Start it by hand when a lead misses a demo: a re-book email now, a second one after two days and a call task after five.",
    subjectKind: "lead",
    trigger: { kind: "manual" },
    settings: { ...DEFAULT_SETTINGS, goal: [LEAD_DONE] },
    steps: [
      email(
        "Sorry we missed each other",
        "We missed you at the Hypedrive demo. These things happen.\n\nReply with a day and time that works and I'll set it up again. It takes about 20 minutes.",
      ),
      wait(2),
      email(
        "Shall we find a new time for your demo?",
        "I haven't heard back about rescheduling. If a different day or time suits you better, reply with it. If you'd rather not go ahead, a one-line reply is fine too.",
      ),
      wait(3),
      task(
        "Call {{record.name}} to re-book the demo",
        "They missed the demo and haven't replied to two emails. Call, offer two slots, and close the lead if they decline.",
      ),
    ],
    translations: {
      hinglish: {
        description:
          "Lead demo miss kar de to haath se start karein: abhi re-book email, do din baad doosra email aur paanch din baad call task.",
        emails: [
          [
            "Demo mein milna reh gaya",
            "Hypedrive demo mein hamari mulaqat nahi ho payi. Aisa ho jaata hai.\n\nAapko jo din aur time suit kare, reply mein bata dijiye, hum demo dobara set kar denge. Isme lagbhag 20 minute lagte hain.",
          ],
          [
            "Demo ke liye naya time dekhein?",
            "Reschedule ke baare mein aapka jawab nahi aaya. Agar koi aur din ya time aapko suit karta hai, to reply kar dijiye. Aur agar aap aage nahi badhna chahte, to ek line ka reply bhi chalega.",
          ],
        ],
      },
      hi: {
        description:
          "लीड डेमो छोड़ दे तो हाथ से शुरू करें: अभी दोबारा समय तय करने का ईमेल, दो दिन बाद दूसरा ईमेल और पाँच दिन बाद कॉल का टास्क।",
        emails: [
          [
            "डेमो में मुलाकात नहीं हो पाई",
            "Hypedrive के डेमो में हमारी मुलाकात नहीं हो पाई। ऐसा हो जाता है।\n\nआपको जो दिन और समय ठीक लगे, जवाब में बता दीजिए। हम डेमो दोबारा तय कर देंगे। इसमें लगभग 20 मिनट लगते हैं।",
          ],
          [
            "डेमो के लिए नया समय तय करें?",
            "दोबारा समय तय करने पर आपका जवाब नहीं आया। अगर कोई और दिन या समय आपको ठीक लगे, तो जवाब में बता दीजिए। अगर आप आगे नहीं बढ़ना चाहते, तो एक लाइन का जवाब भी चलेगा।",
          ],
        ],
      },
    },
  }),
  define({
    key: "gst-failed",
    name: "GST verification failed",
    description:
      "When a brand's GST check fails at signup, emails the usual fixes after two hours and gives the owner a call task two days later.",
    subjectKind: "person",
    trigger: {
      kind: "platform_event",
      eventTypes: ["organization.gst_failed"],
    },
    settings: { ...DEFAULT_SETTINGS, goal: [REGISTERED] },
    steps: [
      wait(2, "hours"),
      email(
        "Your GST check on Hypedrive didn't go through",
        "Your GST verification didn't go through when you signed up. The usual causes are a typo in the GSTIN, a registration that is cancelled or suspended, or a legal name that doesn't match the one on the GST portal.\n\nReply with the GSTIN you used and I'll go through it with you. Hypedrive needs a verified GSTIN before you can create your brand.",
      ),
      wait(2),
      task(
        "Call {{record.name}} to fix their GST",
        "GST failed at signup and they still have no organisation. Find out why, walk them through a retry, or point them to a CA if the registration itself needs fixing.",
      ),
    ],
    translations: {
      hinglish: {
        description:
          "Signup par brand ka GST check fail ho to do ghante baad aam fixes ka email aur do din baad owner ke liye call task.",
        emails: [
          [
            "Hypedrive par aapka GST check pass nahi hua",
            "Signup ke time aapka GST verification pass nahi hua. Aam wajah ye hoti hain: GSTIN mein typo, registration cancel ya suspend ho jaana, ya legal name ka GST portal wale naam se match na karna.\n\nAapne jo GSTIN daala tha wo reply mein bhej dijiye, hum saath mein check kar lenge. Brand banane se pehle Hypedrive ko verified GSTIN chahiye hota hai.",
          ],
        ],
      },
    },
  }),
  define({
    key: "signup-no-org",
    name: "Signed up, no organisation yet",
    description:
      "A day after signup with no organisation created, offers help with the setup form, then a call task two days on.",
    subjectKind: "person",
    trigger: { kind: "platform_event", eventTypes: ["user.signed_up"] },
    settings: { ...DEFAULT_SETTINGS, goal: [REGISTERED] },
    steps: [
      wait(1),
      email(
        "Need a hand setting up your brand on Hypedrive?",
        "You signed up for Hypedrive but haven't created your brand yet. It takes about five minutes and needs your brand name, website, a support phone number and your GSTIN.\n\nIf it's easier, reply and I'll fill it in with you on a call.",
      ),
      wait(2),
      task(
        "Call {{record.name}}: signed up, no organisation",
        "Signed up three days ago and still hasn't created an organisation. Offer to fill the form in together on the call.",
      ),
    ],
    translations: {
      hinglish: {
        description:
          "Signup ke ek din baad bhi organisation na bane to setup form mein help ka email, phir do din baad call task.",
        emails: [
          [
            "Hypedrive par brand setup mein help chahiye?",
            "Aapne Hypedrive par signup kiya, lekin brand abhi create nahi hua. Isme lagbhag paanch minute lagte hain, aur brand name, website, support phone number aur GSTIN chahiye hota hai.\n\nAgar aasan ho to reply kar dijiye, hum call par saath mein form bhar denge.",
          ],
        ],
      },
    },
  }),
  define({
    key: "no-first-top-up",
    name: "No first top-up",
    description:
      "After a brand's organisation is created, explains how to fund the wallet after two days, then gives the owner a call task three days later.",
    subjectKind: "account",
    trigger: { kind: "platform_event", eventTypes: ["organization.created"] },
    settings: { ...DEFAULT_SETTINGS, goal: [FUNDED] },
    steps: [
      wait(2),
      email(
        "Adding funds to start your first campaign",
        "{{account.name|Your brand}} is set up on Hypedrive. The next step is adding funds to your wallet, which you can do by UPI or a bank transfer to your virtual account.\n\nIf you'd like to know how much to start with, tell me your monthly orders and I'll suggest a size.",
      ),
      wait(3),
      task(
        "Call {{account.name}} about their first top-up",
        "Verified and still no top-up after five days. Share the UPI link and virtual account details, and ask what's holding them back.",
      ),
    ],
    translations: {
      hinglish: {
        description:
          "Organisation banne ke do din baad wallet fund karne ka tareeka batane wala email, phir teen din baad owner ke liye call task.",
        emails: [
          [
            "Pehla campaign shuru karne ke liye funds add karein",
            "{{account.name|Aapka brand}} Hypedrive par set up ho chuka hai. Agla step wallet mein funds add karna hai, jo UPI se ya apne virtual account mein bank transfer se ho jaata hai.\n\nKitne se start karein ye jaanna ho to apne monthly orders bata dijiye, hum ek amount suggest kar denge.",
          ],
        ],
      },
    },
  }),
  define({
    key: "dormant-win-back",
    name: "Dormant brand win-back",
    description:
      "For brands whose campaigns have all ended and nothing new has started: an email, a short follow-up after four days and a call task after eight.",
    subjectKind: "account",
    trigger: { kind: "stall_started", ruleIds: ["renewal_due"] },
    settings: DEFAULT_SETTINGS,
    steps: [
      email(
        "What's next for {{account.name|your brand}}?",
        "Your last campaign on Hypedrive has wrapped up. If it went well, the next one is usually easier to plan: new products, another marketplace, or more slots on what sold out.\n\nWant me to send a few suggestions based on your last results?",
      ),
      wait(4),
      email(
        "Closing the loop",
        "A short follow-up on my last note. If you're planning another campaign, reply and I'll help you set it up. If not, no problem, and I won't keep writing.",
      ),
      wait(4),
      task(
        "Win-back call: {{account.name}}",
        "Last campaign ended and two emails got no reply. Share the results, then pitch the next campaign.",
      ),
    ],
    translations: {
      hinglish: {
        description:
          "Un brands ke liye jinke saare campaigns khatam ho gaye aur naya shuru nahi hua: ek email, chaar din baad chhota follow-up aur aath din baad call task.",
        emails: [
          [
            "{{account.name|Aapke brand}} ke liye aage kya?",
            "Hypedrive par aapka last campaign poora ho gaya hai. Agar result achha raha, to agla campaign plan karna aksar aasan hota hai: naye products, ek aur marketplace, ya jo sold out ho gaya us par aur slots.\n\nAapke pichle results ke basis par kuch suggestions bhej dein?",
          ],
          [
            "Baat yahin poori karte hain",
            "Pichle email ka ek chhota sa follow-up. Agar aap ek aur campaign plan kar rahe hain, to reply kar dijiye, hum set up karne mein help karenge. Agar nahi, to koi baat nahi, hum aur email nahi bhejenge.",
          ],
        ],
      },
    },
  }),
  define({
    key: "first-result-check-in",
    name: "Check-in after first approved result",
    description:
      "A day after a brand's approved result, asks how it went and links a short survey. Each brand gets it once.",
    subjectKind: "account",
    trigger: { kind: "platform_event", eventTypes: ["enrollment.approved"] },
    settings: DEFAULT_SETTINGS,
    steps: [
      wait(1),
      email(
        "How did your result go?",
        "Your result on Hypedrive has been approved. How did it go?\n\nIf you have a minute, here is a short survey: {{survey.link}}\n\nOr just reply with a line.",
      ),
    ],
    translations: {
      hinglish: {
        description:
          "Brand ke approved result ke ek din baad poochta hai ki kaisa raha, aur ek chhota survey link bhejta hai. Har brand ko ek hi baar jaata hai.",
        emails: [
          [
            "Aapka result kaisa raha?",
            "Hypedrive par aapka result approve ho gaya hai. Kaisa raha?\n\nAgar time ho to ye chhota sa survey bhar dijiye: {{survey.link}}\n\nYa bas ek line mein reply kar dijiye.",
          ],
        ],
      },
    },
  }),
];

export const TEMPLATE = Object.fromEntries(
  TEMPLATES.map((template) => [template.key, template]),
) as Record<string, AutomationTemplate>;
