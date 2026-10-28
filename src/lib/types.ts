export type ThemeName = "dusk" | "paper";

export type Profile = {
  email: string;
  name: string;
  about: string;
  theme: ThemeName;
  enterToSend: boolean;
  readReceipts: boolean;
  /** set when signed in through the real backend */
  username?: string;
  userId?: string;
  phone?: string | null;
  phoneVerified?: boolean;
};

export type MediaKind = "image" | "voice" | "file";

export type ChatMedia = {
  kind: MediaKind;
  src?: string;
  name?: string;
  durationMs?: number;
};

export type Message = {
  id: string;
  chatId: string;
  from: "me" | "them";
  text: string;
  time: number;
  status: "sent" | "delivered" | "read";
  media?: ChatMedia;
  replyTo?: string;
  author?: string;
  system?: boolean;
};

export type Chat = {
  id: string;
  name: string;
  about: string;
  initials: string;
  tone: number;
  online: boolean;
  lastSeen: string;
  pinned: boolean;
  muted: boolean;
  isAi: boolean;
  isGroup: boolean;
  members?: string;
  lastReadAt: number;
  messages: Message[];
  /** backend user id of the other person (remote mode) */
  peerId?: string;
  username?: string;
};

export type StorySlide = {
  id: string;
  image?: string;
  caption: string;
  time: number;
};

export type Story = {
  id: string;
  authorId: string;
  name: string;
  initials: string;
  tone: number;
  mine?: boolean;
  seen: boolean;
  slides: StorySlide[];
};

export type Note = {
  id: string;
  title: string;
  body: string;
  updated: number;
  pinned: boolean;
};

export type CallMode = "voice" | "video";

export type CallState = {
  chatId: string;
  mode: CallMode;
  incoming: boolean;
  phase: "ringing" | "live";
  startedAt: number | null;
};

export type SheetName = "profile" | "secure" | null;

export type SectionName = "chats" | "vault";
