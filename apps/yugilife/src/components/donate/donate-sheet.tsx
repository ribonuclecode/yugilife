import { forwardRef, useEffect, useMemo, useRef, useState } from "react"

import * as DialogPrimitive from "@radix-ui/react-dialog"
import { motion, useReducedMotion } from "framer-motion"
import { Check, Copy, Mail, MessageCircle, QrCode, Send, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { fontWeights } from "@/lib/font-weight"
import { cn } from "@/lib/utils"

import { donateContacts, donateCopy } from "./donate-contacts"
import { donateSpring } from "./motion"
import { encodeQr, qrPath, qrVersionFor } from "./qr-code"

import type { DonateContact } from "./donate-contacts"
import type { IconComponent } from "@/lib/icon-context"
import type { CSSProperties, HTMLAttributes, ReactNode } from "react"

const icons: Record<DonateContact["id"], IconComponent> = {
  discord: MessageCircle,
  email: Mail,
  telegram: Send,
}

const COPIED_FOR_MS = 1600
const QR_REGION_ID = "donate-qr-codes"

const palette = {
  "--donate-crimson": "#e11d48",
  "--donate-deep": "#6b0f2a",
  "--donate-ink": "#9f1239",
  "--donate-muted": "#7d4152",
  "--donate-rule": "rgba(159, 18, 57, 0.16)",
  "--donate-edge": "rgba(159, 18, 57, 0.34)",
  "--donate-wash": "rgba(255, 255, 255, 0.58)",
} as CSSProperties

const quietButton = cn(
  "text-(--donate-ink)",
  "[--active:rgba(255,255,255,0.86)] [--focus-ring:var(--donate-crimson)]",
  "[--hover:var(--donate-wash)]",
)
const closeButton = cn(
  "fixed top-0 right-0 z-[2] m-4",
  "text-[#ec4899] hover:text-(--donate-crimson) [--focus-ring:var(--donate-crimson)]",
)

const iconButton = cn(
  "grid size-6 shrink-0 cursor-pointer place-items-center rounded-full",
  "text-(--donate-muted) hover:bg-(--donate-wash) hover:text-(--donate-deep)",
  "transition-colors duration-150 motion-reduce:transition-none",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e11d48]",
)

function Mark({ children }: { children: ReactNode }) {
  return (
    <strong
      className="text-(--donate-deep) underline decoration-[rgba(225,29,72,0.42)] decoration-2 underline-offset-[5px]"
      style={{ fontVariationSettings: fontWeights.bold }}
    >
      {children}
    </strong>
  )
}

const rowShell = cn(
  "flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-3",
  "transition-colors duration-150 motion-reduce:transition-none",
)

function RowBody({ children, contact }: { children: ReactNode; contact: DonateContact }) {
  if (!contact.href) return <div className={rowShell}>{children}</div>
  return (
    <a
      href={contact.href}
      target={contact.id === "email" ? undefined : "_blank"}
      rel="noreferrer"
      className={cn(
        rowShell,
        "no-underline hover:bg-(--donate-wash)",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e11d48]",
      )}
    >
      {children}
    </a>
  )
}

function QrImage({ contact, version }: { contact: DonateContact; version: number }) {
  const encoded = contact.href ?? contact.handle
  const matrix = useMemo(() => encodeQr(encoded, version), [encoded, version])
  const extent = matrix.size + 8
  return (
    <motion.figure
      className="m-0 will-change-transform"
      variants={{
        hidden: { opacity: 0, y: -12 },
        shown: { opacity: 1, y: 0 },
      }}
      transition={{ ...donateSpring.tile, opacity: donateSpring.fold }}
    >
      <svg
        role="img"
        aria-label={`QR code for ${contact.label}: ${encoded}`}
        viewBox={`0 0 ${extent} ${extent}`}
        shapeRendering="crispEdges"
        className="mx-auto block h-auto w-full rounded-xl border border-(--donate-rule) bg-white"
      >
        <rect width={extent} height={extent} fill="#fff" />
        <path d={qrPath(matrix)} fill="#9f1239" />
      </svg>
      <figcaption
        className="mt-2 text-center text-[13px] text-(--donate-deep)"
        style={{ fontVariationSettings: fontWeights.semibold }}
      >
        {contact.label}
      </figcaption>
    </motion.figure>
  )
}

export const DonateSheet = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function DonateSheet({ className, style, ...props }, ref) {
    const [copied, setCopied] = useState<DonateContact["id"] | null>(null)
    const [showQr, setShowQr] = useState(false)
    const reduced = useReducedMotion()
    const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

    const qrVersion = useMemo(
      () => Math.max(...donateContacts.map((c) => qrVersionFor(c.href ?? c.handle))),
      [],
    )

    useEffect(() => () => clearTimeout(copiedTimer.current), [])

    const copy = async (contact: DonateContact) => {
      try {
        await navigator.clipboard.writeText(contact.handle)
      } catch {
        return
      }
      clearTimeout(copiedTimer.current)
      setCopied(contact.id)
      copiedTimer.current = setTimeout(() => setCopied(null), COPIED_FOR_MS)
    }

    return (
      <div
        ref={ref}
        tabIndex={-1}
        {...props}
        style={{ ...palette, ...style }}
        className={cn(
          "relative z-[1] my-auto w-[min(34rem,100%)]",
          "text-center text-(--donate-ink) outline-none",
          "text-[14px] leading-relaxed",
          className,
        )}
      >
        <DialogPrimitive.Title
          className="m-0 text-[clamp(2.125rem,7.2vw,3.5rem)] leading-[1.02] tracking-[-0.032em] text-balance text-(--donate-deep)"
          style={{ fontVariationSettings: fontWeights.bold }}
        >
          {donateCopy.title}
        </DialogPrimitive.Title>
        <DialogPrimitive.Description
          className="mx-auto mt-4 text-[clamp(1rem,2.3vw,1.1875rem)] leading-relaxed"
          style={{ fontVariationSettings: fontWeights.medium }}
        >
          <strong
            className="mb-9 block text-[1.3em] leading-snug text-(--donate-crimson)"
            style={{ fontVariationSettings: fontWeights.bold }}
          >
            {donateCopy.situation}
          </strong>
          <span className="mx-auto block max-w-[30rem] text-balance">
            If you can help with <Mark>money</Mark>, <Mark>relocation</Mark>, or <Mark>work</Mark>,
            message me.
          </span>
        </DialogPrimitive.Description>

        <ul
          className="m-0 mt-8 list-none divide-y divide-[rgba(159,18,57,0.16)] p-0 text-left"
          aria-label="Ways to reach me"
        >
          {donateContacts.map((contact) => {
            const Icon = icons[contact.id]
            const isCopied = copied === contact.id
            return (
              <li key={contact.id} className="flex items-center gap-1">
                <RowBody contact={contact}>
                  <Icon
                    size={17}
                    strokeWidth={1.75}
                    aria-hidden
                    className="shrink-0 text-(--donate-crimson)"
                  />
                  <span
                    className="shrink-0 text-[14px] text-(--donate-deep)"
                    style={{ fontVariationSettings: fontWeights.semibold }}
                  >
                    {contact.label}
                  </span>
                  <span
                    className="ml-auto truncate text-[13px] text-(--donate-muted)"
                    title={contact.handle}
                  >
                    {contact.handle}
                  </span>
                </RowBody>
                <button
                  type="button"
                  data-copied={isCopied}
                  aria-label={isCopied ? `Copied ${contact.label}` : `Copy ${contact.label}`}
                  onClick={() => void copy(contact)}
                  className={cn(iconButton, "size-8", "data-[copied=true]:text-(--donate-crimson)")}
                >
                  {isCopied ? (
                    <Check size={14} strokeWidth={2.25} aria-hidden />
                  ) : (
                    <Copy size={14} strokeWidth={1.75} aria-hidden />
                  )}
                </button>
              </li>
            )
          })}
        </ul>

        <Button
          variant="ghost"
          size="compact"
          leadingIcon={QrCode}
          aria-expanded={showQr}
          aria-controls={QR_REGION_ID}
          onClick={() => setShowQr((shown) => !shown)}
          className={cn(quietButton, "mt-5 text-(--donate-muted) hover:text-(--donate-crimson)")}
        >
          {showQr ? "Hide QR codes" : "Show QR codes"}
        </Button>
        <motion.div
          className="overflow-hidden"
          initial={false}
          animate={showQr ? "shown" : "hidden"}
          variants={{ hidden: { height: 0 }, shown: { height: "auto" } }}
          transition={reduced ? { duration: 0 } : donateSpring.fold}
        >
          <motion.div
            id={QR_REGION_ID}
            inert={!showQr}
            aria-hidden={!showQr}
            className="mt-4 grid grid-cols-3 gap-3"
            variants={{
              hidden: {
                transition: reduced
                  ? { duration: 0 }
                  : { staggerChildren: donateSpring.stagger, staggerDirection: -1 },
              },
              shown: {
                transition: reduced
                  ? { duration: 0 }
                  : { delayChildren: donateSpring.stagger, staggerChildren: donateSpring.stagger },
              },
            }}
          >
            {donateContacts.map((contact) => (
              <QrImage key={contact.id} contact={contact} version={qrVersion} />
            ))}
          </motion.div>
        </motion.div>

        <p className="mx-auto mt-7 max-w-[30rem] text-[13px] text-balance text-(--donate-ink)">
          {donateCopy.note}
        </p>

        <DialogPrimitive.Close asChild>
          <Button variant="text" size="icon" aria-label="Close" className={closeButton}>
            <X strokeWidth={1.75} aria-hidden />
          </Button>
        </DialogPrimitive.Close>
      </div>
    )
  },
)
