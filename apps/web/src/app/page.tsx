import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LanguageSwitcher } from "@/components/language-switcher";

export default async function HomePage() {
  const t = await getTranslations("landing");
  const nav = await getTranslations("nav");
  const meta = await getTranslations("meta");

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#f7d9c4,_transparent_28%),radial-gradient(circle_at_80%_0%,_#cfe4df,_transparent_32%),#f4ede4]">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-6">
        <div>
          <p className="font-display text-2xl text-teal">{meta("company")}</p>
          <p className="text-sm text-muted">{meta("tagline")}</p>
        </div>
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <Link href="/login" className="hidden text-sm font-semibold sm:inline">
            {nav("login")}
          </Link>
          <Link
            href="/register"
            className="inline-flex h-11 items-center rounded-full bg-teal px-5 text-sm font-semibold text-paper hover:bg-teal-dark"
          >
            {nav("register")}
          </Link>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-12 px-4 pb-20 pt-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-copper">{t("eyebrow")}</p>
          <h1 className="mt-4 max-w-xl font-display text-5xl leading-tight text-ink sm:text-6xl">{t("title")}</h1>
          <p className="mt-5 max-w-xl text-lg text-muted">{t("body")}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/register"
              className="inline-flex h-12 items-center rounded-full bg-teal px-6 text-sm font-semibold text-paper hover:bg-teal-dark"
            >
              {t("primary")}
            </Link>
            <Link
              href="/login"
              className="inline-flex h-12 items-center rounded-full border border-line bg-paper px-6 text-sm font-semibold text-ink hover:border-ink"
            >
              {t("secondary")}
            </Link>
          </div>
          <p className="mt-6 text-sm text-muted">{t("phase")}</p>
        </div>
        <div className="grid gap-4">
          <article className="rounded-3xl border border-line bg-paper/80 p-6 backdrop-blur">
            <h2 className="font-display text-2xl text-teal">{t("f1")}</h2>
            <p className="mt-2 text-muted">{t("f1b")}</p>
          </article>
          <article className="rounded-3xl border border-line bg-paper/80 p-6 backdrop-blur">
            <h2 className="font-display text-2xl text-teal">{t("f2")}</h2>
            <p className="mt-2 text-muted">{t("f2b")}</p>
          </article>
          <article className="rounded-3xl border border-line bg-paper/80 p-6 backdrop-blur">
            <h2 className="font-display text-2xl text-teal">{t("f3")}</h2>
            <p className="mt-2 text-muted">{t("f3b")}</p>
          </article>
        </div>
      </main>
    </div>
  );
}
