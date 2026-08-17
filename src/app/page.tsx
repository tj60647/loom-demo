import Shelf from "@/components/shelf/Shelf"

/**
 * The shelf is a client component — it needs the session and the loom — so the
 * one thing it cannot work out for itself is which deployment it is running on.
 * `VERCEL_ENV` is a server variable, and deliberately not NEXT_PUBLIC: the flag
 * decides which sign-in door the page offers, and a value the client could set
 * is not a thing to decide that on.
 *
 * Passed as a prop rather than read from a context so there is exactly one
 * place it enters the client bundle.
 */
export default function Home() {
  return <Shelf isPreviewDeployment={process.env.VERCEL_ENV === "preview"} />
}
