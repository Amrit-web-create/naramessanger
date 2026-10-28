import type { Chat, Message, Note, Story } from "@/lib/types";

const now = Date.now();
const min = (m: number) => now - m * 60_000;

function msg(partial: Omit<Message, "status"> & { status?: Message["status"] }): Message {
  return { status: "read", ...partial };
}

export function replyFor(chat: Chat, text: string, hadMedia: boolean) {
  const t = text.toLowerCase();
  const author = chat.isGroup ? (["Asha", "Dev", "Noor"][text.length % 3] ?? "Asha") : undefined;
  if (hadMedia && !t) return { text: "Got it. I'll look properly in a minute.", author };
  if (t.includes("call") || t.includes("ring"))
    return { text: "I can do a short call. Give me two minutes.", author };
  if (chat.id === "mira") {
    if (t.includes("sat") || t.includes("sun") || t.includes("when"))
      return { text: "Saturday. I'll be at the trailhead by nine if the fog lifts.", author };
    const lines = [
      "The light stayed. I'm walking down now.",
      "Bring a layer. The ridge wind is colder than it looks.",
      "I'll send the pin when I hit the fork.",
    ];
    return { text: lines[t.length % lines.length] ?? lines[0], author };
  }
  if (chat.id === "jonah") {
    const lines = [
      "Soap is under the sink if you get home first.",
      "Also: the oats are the plain tin, not the maple ones.",
      "I'll start dinner if you're past seven.",
    ];
    return { text: lines[t.length % lines.length] ?? lines[0], author };
  }
  if (chat.id === "studio") {
    const lines = [
      "Thursday still holds. I'll lock the room.",
      "Leave the figs caption-free. Agreed.",
      "I can print the frames tonight.",
    ];
    return { text: lines[t.length % lines.length] ?? lines[0], author };
  }
  if (chat.id === "leela") {
    const lines = [
      "The gate sticks. Lift it as you push.",
      "Cuttings will keep in a damp cloth until you pot them.",
      "I'll put the kettle on if I hear the latch.",
    ];
    return { text: lines[t.length % lines.length] ?? lines[0], author };
  }
  if (chat.id === "priya") {
    const lines = [
      "The rim cracked on one. This pot survived.",
      "Dust washes off. Don't scrub the foot.",
      "Come by the studio if you want to see the glaze fire.",
    ];
    return { text: lines[t.length % lines.length] ?? lines[0], author };
  }
  return { text: "Received. I'll come back to this.", author };
}

export const seedChats: Chat[] = [
  {
    id: "guide",
    name: "Nara Guide",
    about: "Drafts, plans, and a second opinion. Replies are written when you send.",
    initials: "N",
    tone: 0,
    online: true,
    lastSeen: "online",
    pinned: true,
    muted: false,
    isAi: true,
    isGroup: false,
    lastReadAt: min(1),
    messages: [
      msg({
        id: "g1",
        chatId: "guide",
        from: "them",
        text: "I'm Nara Guide. Ask me to draft a reply, plan a Saturday, or untangle a note. I only write when you message me.",
        time: min(50),
      }),
    ],
  },
  {
    id: "mira",
    name: "Mira Chen",
    about: "Walking the ridge trail",
    initials: "MC",
    tone: 1,
    online: true,
    lastSeen: "online",
    pinned: true,
    muted: false,
    isAi: false,
    isGroup: false,
    lastReadAt: min(40),
    messages: [
      msg({
        id: "mi1",
        chatId: "mira",
        from: "them",
        text: "The ridge was clear this morning. I'm posting the fog before it burns off.",
        time: min(180),
      }),
      msg({
        id: "mi2",
        chatId: "mira",
        from: "me",
        text: "Save me a still if the light stays like that.",
        time: min(150),
        status: "read",
      }),
      msg({
        id: "mi3",
        chatId: "mira",
        from: "them",
        text: "Already did. Coffee next, then I walk back down.",
        time: min(28),
      }),
      msg({
        id: "mi4",
        chatId: "mira",
        from: "them",
        text: "You coming Saturday or Sunday?",
        time: min(12),
      }),
    ],
  },
  {
    id: "jonah",
    name: "Jonah Hale",
    about: "Kitchen, probably",
    initials: "JH",
    tone: 2,
    online: false,
    lastSeen: "last seen today",
    pinned: false,
    muted: false,
    isAi: false,
    isGroup: false,
    lastReadAt: min(5),
    messages: [
      msg({
        id: "j1",
        chatId: "jonah",
        from: "them",
        text: "We're out of oats again.",
        time: min(400),
      }),
      msg({
        id: "j2",
        chatId: "jonah",
        from: "me",
        text: "I'll grab some on the way.",
        time: min(380),
        status: "read",
      }),
      msg({
        id: "j3",
        chatId: "jonah",
        from: "them",
        text: "And dish soap. The good one, not the perfume.",
        time: min(360),
      }),
      msg({
        id: "j4",
        chatId: "jonah",
        from: "me",
        text: "Noted. Plain tin of oats, unscented soap.",
        time: min(20),
        status: "read",
      }),
    ],
  },
  {
    id: "studio",
    name: "Studio North",
    about: "Asha, Dev, Noor, and you",
    initials: "SN",
    tone: 3,
    online: false,
    lastSeen: "Asha, Dev, Noor",
    members: "Asha, Dev, Noor, you",
    pinned: false,
    muted: false,
    isAi: false,
    isGroup: true,
    lastReadAt: min(90),
    messages: [
      msg({
        id: "s1",
        chatId: "studio",
        from: "them",
        author: "Asha",
        text: "Client moved the review to Thursday. Same room, earlier start.",
        time: min(60 * 26),
      }),
      msg({
        id: "s2",
        chatId: "studio",
        from: "them",
        author: "Dev",
        text: "I can bring the type frames.",
        time: min(60 * 25),
      }),
      msg({
        id: "s3",
        chatId: "studio",
        from: "me",
        text: "I'll handle the walkthrough.",
        time: min(60 * 24),
        status: "read",
      }),
      msg({
        id: "s4",
        chatId: "studio",
        from: "them",
        author: "Noor",
        text: "Offsite reference. Don't crop the linen.",
        time: min(40),
        media: { kind: "image", src: "/media/picnic.jpg" },
      }),
      msg({
        id: "s5",
        chatId: "studio",
        from: "them",
        author: "Asha",
        text: "Don't caption it. Let the figs talk.",
        time: min(18),
      }),
    ],
  },
  {
    id: "leela",
    name: "Aunt Leela",
    about: "In the garden until the light goes",
    initials: "AL",
    tone: 4,
    online: false,
    lastSeen: "last seen yesterday",
    pinned: false,
    muted: false,
    isAi: false,
    isGroup: false,
    lastReadAt: min(60 * 30),
    messages: [
      msg({
        id: "l1",
        chatId: "leela",
        from: "them",
        text: "The nasturtiums finally took. Come by if you want cuttings.",
        time: min(60 * 20),
      }),
      msg({
        id: "l2",
        chatId: "leela",
        from: "them",
        text: "I'll be outside until the light goes. The gate sticks — lift as you push.",
        time: min(60 * 6),
      }),
    ],
  },
  {
    id: "priya",
    name: "Priya Raman",
    about: "Glazing bowls today",
    initials: "PR",
    tone: 1,
    online: true,
    lastSeen: "online",
    pinned: false,
    muted: false,
    isAi: false,
    isGroup: false,
    lastReadAt: min(8),
    messages: [
      msg({
        id: "p1",
        chatId: "priya",
        from: "them",
        text: "",
        time: min(80),
        media: { kind: "voice", durationMs: 2000 },
      }),
      msg({
        id: "p2",
        chatId: "priya",
        from: "them",
        text: "New pot. The clay is still dusty.",
        time: min(70),
        media: { kind: "image", src: "/media/succulent.jpg" },
      }),
      msg({
        id: "p3",
        chatId: "priya",
        from: "me",
        text: "That rim is lovely. Keep this one.",
        time: min(30),
        status: "read",
      }),
    ],
  },
];

export const seedStories: Story[] = [
  {
    id: "me",
    authorId: "me",
    name: "You",
    initials: "Y",
    tone: 0,
    mine: true,
    seen: true,
    slides: [],
  },
  {
    id: "story-mira",
    authorId: "mira",
    name: "Mira",
    initials: "MC",
    tone: 1,
    seen: false,
    slides: [
      { id: "sm1", image: "/media/tea.jpg", caption: "Above the fog line.", time: min(26) },
      { id: "sm2", image: "/media/coffee.jpg", caption: "Second cup, then down.", time: min(20) },
    ],
  },
  {
    id: "story-jonah",
    authorId: "jonah",
    name: "Jonah",
    initials: "JH",
    tone: 2,
    seen: false,
    slides: [{ id: "sj1", image: "/media/rain.jpg", caption: "Walked home the long way.", time: min(90) }],
  },
  {
    id: "story-leela",
    authorId: "leela",
    name: "Leela",
    initials: "AL",
    tone: 4,
    seen: true,
    slides: [
      { id: "sl1", image: "/media/cliff.jpg", caption: "The path after the turn.", time: min(60 * 8) },
    ],
  },
  {
    id: "story-priya",
    authorId: "priya",
    name: "Priya",
    initials: "PR",
    tone: 1,
    seen: false,
    slides: [
      {
        id: "sp1",
        image: "/media/succulent.jpg",
        caption: "Still life, mostly accidental.",
        time: min(70),
      },
    ],
  },
];

export const seedNotes: Note[] = [
  {
    id: "n1",
    title: "Saturday ridge",
    body: "Trailhead by nine.\nLayer for wind.\nFlask, and the small lens.\nText Mira when I leave the fork.",
    updated: min(40),
    pinned: true,
  },
  {
    id: "n2",
    title: "Studio Thursday",
    body: "Review is earlier. Walkthrough is mine.\nDev brings type frames.\nNo caption on the picnic still.",
    updated: min(15),
    pinned: false,
  },
];
