import { useState } from "react"
import { SKINS } from "../skins"
import { version } from "../../package.json"
import type { Translator } from "../i18n"

const REPOSITORY_URL = "https://github.com/giuliastro/harness-remote"

/** The skin gallery: one card per registered skin with its author; used by About and Settings → Visual. */
export function SkinGalleryModal({ t, skin, onSkinChange, onClose }: { t: Translator; skin: string; onSkinChange: (id: string) => void; onClose: () => void }) {
  return (
    <>
      <button type="button" className="hr-rules-modal-backdrop" aria-label={t("action.close")} onClick={onClose} />
      <section className="hr-rules-modal hr-skins-modal" role="dialog" aria-modal="true" aria-label={t("settings.aboutSkins")}>
        <header>
          <strong>{t("settings.aboutSkins")}</strong>
          <button type="button" aria-label={t("action.close")} onClick={onClose}>×</button>
        </header>
        <small>{t("settings.aboutSkinsHint")}</small>
        <ul className="hr-skin-cards">
          {SKINS.map((option) => {
            const active = option.id === skin
            return (
              <li key={option.id} className={active ? "active" : undefined}>
                <div className="hr-skin-card-head">
                  <strong>{t(option.nameKey)}</strong>
                  {active
                    ? <span className="hr-skin-badge">{t("settings.skinInUse")}</span>
                    : <button type="button" className="hr-skin-use" onClick={() => onSkinChange(option.id)}>{t("settings.skinUse")}</button>}
                </div>
                <p>{t(option.descriptionKey)}</p>
                <a href={`https://github.com/${option.github}`} target="_blank" rel="noopener noreferrer">
                  {t("settings.aboutSkinBy", { name: option.author })}
                </a>
              </li>
            )
          })}
        </ul>
      </section>
    </>
  )
}

/** Settings → About: version, creator, repository, license, skins and a link to the contributors. */
export function AboutSection({ t, skin, onSkinChange }: { t: Translator; skin: string; onSkinChange: (id: string) => void }) {
  const [skinsOpen, setSkinsOpen] = useState(false)
  return (
    <div className="hr-mobile-settings-group hr-about" data-settings-about>
      <span>{t("settings.about")}</span>
      <div className="hr-about-hero">
        <img src={`${import.meta.env.BASE_URL}app-icon.png`} alt="" />
        <div>
          <strong>Harness Remote</strong>
          <small>{t("settings.aboutVersion")} {version}</small>
        </div>
      </div>
      <a className="hr-about-row" data-icon="creator" href="https://github.com/giuliastro" target="_blank" rel="noopener noreferrer">
        <strong>{t("settings.aboutCreator")}</strong>
        <span>Giulio Ardoino ›</span>
      </a>
      <a className="hr-about-row" data-icon="repository" href={REPOSITORY_URL} target="_blank" rel="noopener noreferrer">
        <strong>{t("settings.aboutRepository")}</strong>
        <span>giuliastro/harness-remote ›</span>
      </a>
      <a className="hr-about-row" data-icon="license" href={`${REPOSITORY_URL}/blob/main/LICENSE`} target="_blank" rel="noopener noreferrer">
        <strong>{t("settings.aboutLicense")}</strong>
        <span>Apache-2.0 ›</span>
      </a>
      <button type="button" className="hr-about-row" data-icon="skin" onClick={() => setSkinsOpen(true)}>
        <strong>{t("settings.aboutSkins")}</strong>
        <span>{t("settings.aboutSkinsCount", { count: SKINS.length })} ›</span>
      </button>
      {skinsOpen ? <SkinGalleryModal t={t} skin={skin} onSkinChange={onSkinChange} onClose={() => setSkinsOpen(false)} /> : null}
      <a className="hr-about-row" data-icon="contributors" href={`${REPOSITORY_URL}/graphs/contributors`} target="_blank" rel="noopener noreferrer">
        <strong>{t("settings.aboutContributors")}</strong>
        <span>GitHub ›</span>
      </a>
    </div>
  )
}
