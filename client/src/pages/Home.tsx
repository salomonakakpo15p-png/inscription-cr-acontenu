import { FormEvent, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, Check, Clock3, Download, Globe2, ImagePlus, MapPin, ShieldCheck, Sparkles, Users, X } from "lucide-react";
import { toast } from "sonner";
import { EVENT, EVENT_DATE_UPPER, EVENT_DATETIME_LONG } from "@shared/event";
import { trpc } from "@/lib/trpc";
import { composePoster, defaultPhotoTransform, loadImage, type PhotoTransform } from "@/lib/poster";
import { compressPhoto } from "@/lib/photo";

type Draft = { lastName: string; firstName: string; country: string; photoData?: string; photoTransform: PhotoTransform };

function cropPreviewStyle(transform: PhotoTransform) {
  return {
    transform: `translate(${transform.offsetX / 2}%, ${transform.offsetY / 2}%) scale(${transform.zoom})`,
  };
}

async function detectFaceTransform(photoData: string): Promise<PhotoTransform> {
  const fallback = { ...defaultPhotoTransform };
  try {
    const FaceDetectorCtor = (globalThis as typeof globalThis & { FaceDetector?: new (options?: object) => { detect: (image: HTMLImageElement) => Promise<Array<{ boundingBox: DOMRectReadOnly }>> } }).FaceDetector;
    if (!FaceDetectorCtor) return fallback;
    const image = await loadImage(photoData);
    const faces = await new FaceDetectorCtor({ fastMode: true, maxDetectedFaces: 1 }).detect(image);
    const face = faces[0]?.boundingBox;
    if (!face) return fallback;
    const faceCenterX = (face.x + face.width / 2) / image.naturalWidth;
    const faceCenterY = (face.y + face.height / 2) / image.naturalHeight;
    const faceWidth = face.width / image.naturalWidth;
    return {
      zoom: Math.min(2.2, Math.max(1, 0.34 / Math.max(faceWidth, 0.12))),
      offsetX: Math.min(100, Math.max(-100, (0.5 - faceCenterX) * 180)),
      offsetY: Math.min(100, Math.max(-100, (0.5 - faceCenterY) * 180)),
    };
  } catch {
    return fallback;
  }
}

export default function Home() {
  const [form, setForm] = useState({ lastName: "", firstName: "", country: "" });
  const [photoData, setPhotoData] = useState<string>();
  const [photoName, setPhotoName] = useState<string>();
  const [photoTransform, setPhotoTransform] = useState<PhotoTransform>(defaultPhotoTransform);
  const [isAnalyzingPhoto, setIsAnalyzingPhoto] = useState(false);
  const [submittedParticipant, setSubmittedParticipant] = useState<Draft>();
  const [generatedPoster, setGeneratedPoster] = useState<string>();
  const createParticipant = trpc.participants.create.useMutation({
    onError: (error) => toast.error("Inscription impossible", { description: error.message }),
  });

  function handlePhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
      toast.error("Format non pris en charge", { description: "Choisissez une image JPG, PNG ou WebP." });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Photo trop volumineuse", { description: "La photo doit faire 5 Mo maximum." });
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const data = await compressPhoto(String(reader.result));
      setPhotoData(data);
      setPhotoName(file.name);
      setIsAnalyzingPhoto(true);
      setPhotoTransform(await detectFaceTransform(data));
      setIsAnalyzingPhoto(false);
    };
    reader.readAsDataURL(file);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const draft: Draft = { ...form, photoData, photoTransform };
    createParticipant.mutate(draft, {
      onSuccess: async () => {
        setSubmittedParticipant(draft);
        toast.success("Inscription confirmée", { description: "Votre place et votre photo sont bien enregistrées." });
        try {
          setGeneratedPoster(
            await composePoster(draft.photoData, draft.photoTransform, {
              lastName: draft.lastName,
              firstName: draft.firstName,
              country: draft.country,
            }),
          );
        } catch {
          setGeneratedPoster(EVENT.posterUrl);
          toast.error("Affiche non composée", { description: "L’affiche vierge reste téléchargeable." });
        }
      },
    });
  }

  function downloadPoster() {
    if (!submittedParticipant || !generatedPoster) return;
    const link = document.createElement("a");
    link.href = generatedPoster;
    link.download =
      generatedPoster === EVENT.posterUrl
        ? "affiche-creation-de-contenu.jpg"
        : `affiche-${submittedParticipant.firstName}-${submittedParticipant.lastName}.png`;
    link.click();
  }

  return (
    <main className="site-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <nav className="topbar page-width">
        <a className="brand" href="#top" aria-label="Retour en haut"><span className="brand-mark">CC</span><span><strong>Création</strong> de contenu</span></a>
        <div className="topbar-actions"><a href="#inscription" className="nav-link">S’inscrire</a><Link href="/gestion" className="admin-link">Espace organisateur <ArrowRight size={15} /></Link></div>
      </nav>

      <section id="top" className="hero page-width">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-dot" /> ÉVÉNEMENT EN LIGNE · {EVENT_DATE_UPPER}</div>
          <h1>Le contenu qui <em>rassemble.</em></h1>
          <p className="hero-lede">Une masterclass pour apprendre, créer et faire rayonner vos idées. Inscrivez-vous gratuitement en quelques secondes.</p>
          <div className="hero-meta"><span><Clock3 size={17} /> {EVENT.time}</span><span><Globe2 size={17} /> Accessible partout</span></div>
          <a className="primary-cta" href="#inscription">Réserver ma place <ArrowRight size={18} /></a>
        </div>
        <div className="hero-poster-wrap"><div className="poster-glow" /><img className="hero-poster" src={EVENT.posterUrl} width={1400} height={1400} fetchPriority="high" alt="Affiche de l’événement Création de contenu" /></div>
      </section>

      <section className="proof-strip page-width" aria-label="Informations pratiques">
        <div className="proof-item"><span className="proof-icon orange"><Users size={19} /></span><span><strong>100% gratuit</strong><small>Sans frais cachés</small></span></div>
        <div className="proof-item"><span className="proof-icon blue"><MapPin size={19} /></span><span><strong>Depuis votre pays</strong><small>Participation en ligne</small></span></div>
        <div className="proof-item"><span className="proof-icon green"><ShieldCheck size={19} /></span><span><strong>Inscription rapide</strong><small>Vos données restent privées</small></span></div>
      </section>

      <section id="inscription" className="registration-section page-width">
        <div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> VOTRE INVITATION</div><h2>J’y serai<span>.</span></h2></div><p>Indiquez vos coordonnées et ajoutez votre photo pour apparaître sur votre affiche personnalisée.</p></div>
        <div className="registration-grid">
          <div className="form-card">
            {submittedParticipant ? (
              <div className="success-state">
                <div className="success-icon"><Check size={28} /></div>
                <span className="success-kicker">C’est enregistré !</span>
                <h3>{generatedPoster ? "Votre affiche est prête." : "Préparation de votre affiche…"}</h3>
                <p>Votre inscription est confirmée pour le <strong>{EVENT_DATETIME_LONG}</strong>. Votre photo a été intégrée ci-dessous.</p>
                {generatedPoster ? <img className="generated-poster" src={generatedPoster} alt="Affiche personnalisée" /> : <div className="poster-pending">Composition en cours…</div>}
                <button className="download-button" type="button" disabled={!generatedPoster} onClick={downloadPoster}><Download size={17} /> Télécharger mon affiche</button>
                <button className="secondary-cta" type="button" onClick={() => { setSubmittedParticipant(undefined); setGeneratedPoster(undefined); setPhotoData(undefined); setPhotoName(undefined); setPhotoTransform(defaultPhotoTransform); setForm({ lastName: "", firstName: "", country: "" }); }}>Inscrire une autre personne</button>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <div className="form-intro"><span className="step-badge">01</span><div><h3>Vos informations</h3><p>Les champs marqués d’un astérisque sont obligatoires.</p></div></div>
                <div className="form-row"><label>Nom <span>*</span><input required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} placeholder="Ex. ADJOVI" autoComplete="family-name" /></label><label>Prénom <span>*</span><input required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder="Ex. Grâce" autoComplete="given-name" /></label></div>
                <label>Pays de résidence <span>*</span><input required value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} placeholder="Ex. Bénin" autoComplete="country-name" /></label>
                <div className="photo-field"><div className="photo-field-heading"><span className="photo-step">02</span><div><strong>Votre photo <small>(optionnel)</small></strong><p>Votre visage sera automatiquement centré dans le cadre noir.</p></div></div>{photoData ? <><div className="photo-selected"><img src={photoData} alt="Aperçu de votre photo" /><div><strong>{photoName}</strong><span>{isAnalyzingPhoto ? "Analyse du visage…" : "Visage centré automatiquement"}</span></div><button type="button" aria-label="Retirer la photo" onClick={() => { setPhotoData(undefined); setPhotoName(undefined); setPhotoTransform(defaultPhotoTransform); }}><X size={16} /></button></div><div className="crop-editor automatic-crop"><div className="crop-frame"><img src={photoData} alt="Aperçu du centrage automatique" style={cropPreviewStyle(photoTransform)} /></div><div className="auto-crop-info"><strong>{isAnalyzingPhoto ? "Détection en cours…" : "Cadrage automatique activé"}</strong><p>Le visage est placé au centre de l’affiche. Si la détection n’est pas disponible, un centrage général est appliqué.</p><span><Sparkles size={13} /> Ajustement prêt pour la génération</span></div></div></> : <label className="photo-dropzone"><ImagePlus size={20} /><span><strong>Ajouter une photo</strong><small>JPG, PNG ou WebP · 5 Mo max · optimisée automatiquement</small></span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhoto} /></label>}</div>
                <div className="privacy-note"><ShieldCheck size={17} /><span>Vos informations servent uniquement à gérer les inscriptions et générer votre affiche.</span></div>
                <button className="submit-button" type="submit" disabled={createParticipant.isPending}>{createParticipant.isPending ? "Enregistrement…" : "Je confirme ma présence"}<ArrowRight size={18} /></button>
              </form>
            )}
          </div>
          <aside className="event-card"><span className="event-label">À retenir</span><div className="event-date"><strong>{EVENT.day}</strong><span><b>{EVENT.monthShort}</b><small>{EVENT.year}</small></span></div><div className="event-line"><Clock3 size={18} /><span><strong>{EVENT.time}</strong><small>Ouverture de la salle à {EVENT.opensAt}</small></span></div><div className="event-line"><Globe2 size={18} /><span><strong>En ligne</strong><small>Le lien sera communiqué aux inscrits</small></span></div><div className="event-line"><Sparkles size={18} /><span><strong>Affiche personnalisée</strong><small>Ajoutez votre photo à l’inscription</small></span></div></aside>
        </div>
      </section>

      <footer className="footer page-width"><span>© 2026 · Création de contenu</span><span>Une initiative pour les créateurs de demain</span></footer>
    </main>
  );
}
