export interface DonateContact {
  readonly id: "telegram" | "discord" | "email"
  readonly label: string
  readonly handle: string
  readonly href?: string
}

export const donateContacts: readonly DonateContact[] = [
  {
    id: "telegram",
    label: "Telegram",
    handle: "@alixsep",
    href: "https://t.me/alixsep",
  },
  {
    id: "discord",
    label: "Discord",
    handle: "alixsepofficial",
  },
  {
    id: "email",
    label: "Email",
    handle: "alixsep@outlook.com",
    href: "mailto:alixsep@outlook.com",
  },
]

export const donateCopy = {
  title: "I need your support",
  situation: "I’m living in Iran, and there’s a war.",
  note: "Yugilife is free and always will be. For donations, message me and I’ll send a Bitcoin Lightning invoice.",
} as const
