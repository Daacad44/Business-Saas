"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { setLocale } from "@/app/actions/locale";

export function LanguageSwitcher() {
  const locale = useLocale();
  const t = useTranslations("nav");
  const router = useRouter();

  async function change(next: "en" | "so") {
    await setLocale(next);
    router.refresh();
  }

  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-line bg-paper p-1 text-xs">
      <span className="sr-only">{t("language")}</span>
      <button
        type="button"
        onClick={() => change("en")}
        className={`rounded-full px-3 py-1 font-semibold ${locale === "en" ? "bg-teal text-paper" : "text-muted"}`}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => change("so")}
        className={`rounded-full px-3 py-1 font-semibold ${locale === "so" ? "bg-teal text-paper" : "text-muted"}`}
      >
        SO
      </button>
    </div>
  );
}
