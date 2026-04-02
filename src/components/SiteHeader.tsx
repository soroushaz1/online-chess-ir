import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="flex items-center gap-3 transition-opacity hover:opacity-80"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-black text-sm font-bold text-white">
            OC
          </div>

          <div>
            <p className="text-sm font-semibold leading-none text-black">
              Online Chess IR
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Play. Review. Improve.
            </p>
          </div>
        </Link>

        <nav className="flex items-center gap-4 text-sm">
          <Link href="/" className="text-gray-600 hover:text-black">
            Home
          </Link>
          <Link href="/games" className="text-gray-600 hover:text-black">
            History
          </Link>
        </nav>
      </div>
    </header>
  );
}