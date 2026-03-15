import { useState, useRef, useEffect } from 'react';
import Head from 'next/head';

const C = {
  ivory:  '#FAF8F4',
  beige:  '#EDE8DF',
  sand:   '#D6CCBC',
  taupe:  '#A89B8C',
  mink:   '#6B5E52',
  noir:   '#1C1714',
  gold:   '#C4A97D',
  green:  '#2D6A4F',
  orange: '#C4612D',
};

const BADGE = {
  exact:     { bg: C.green,  label: '✓ En stock' },
  similar:   { bg: C.gold,   label: '~ Similaire' },
  not_found: { bg: C.taupe,  label: '◎ À sourcer' },
};

export default function Lucy() {
  const [messages,       setMessages]       = useState([{
    role: 'assistant',
    content: "Bonjour ! Je suis Lucy 👗\nDécris-moi le vêtement que tu veux créer, ou uploade une photo d'inspiration — je le reproduis avec les matières disponibles dans ma base.",
  }]);
  const [input,          setInput]          = useState('');
  const [loading,        setLoading]        = useState(false);
  const [generating,     setGenerating]     = useState(false);
  const [design,         setDesign]         = useState(null);
  const [components,     setComponents]     = useState([]);
  const [renderedImage,  setRenderedImage]  = useState(null);
  const [preview,        setPreview]        = useState(null);
  const [pendingImg,     setPendingImg]     = useState(null);

  const bottomRef  = useRef(null);
  const fileRef    = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleFile = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result);
      setPendingImg({ base64: reader.result.split(',')[1], mediaType: file.type });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const send = async () => {
    const text = input.trim();
    if (!text && !pendingImg) return;

    const userMsg = { role: 'user', content: text || 'Crée ce vêtement avec tes matières disponibles.' };
    const history = [...messages, userMsg];

    setMessages(history);
    setInput('');
    setPreview(null);
    const img = pendingImg;
    setPendingImg(null);
    setLoading(true);

    try {
      // ── 1. Analyse du prompt par Claude ──────────────────────────────────────
      const chatRes = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history,
          imageBase64:   img?.base64    || null,
          imageMediaType: img?.mediaType || 'image/jpeg',
        }),
      });
      if (!chatRes.ok) throw new Error('Erreur serveur.');
      const chatData = await chatRes.json();

      // Simple message — question ou refus
      if (chatData.type === 'message') {
        setMessages(prev => [...prev, { role: 'assistant', content: chatData.content }]);
        setLoading(false);
        return;
      }

      // Design ready
      const { design: newDesign, components_needed, message } = chatData.data;
      setDesign(newDesign);
      setMessages(prev => [...prev, { role: 'assistant', content: message }]);
      setLoading(false);
      setGenerating(true);

      // ── 2. Matching composants Airtable ──────────────────────────────────────
      const compRes = await fetch('/api/components', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ design: newDesign, components_needed }),
      });
      const compData = await compRes.json();
      const found = compData.components || [];
      setComponents(found);

      // Notifie les substitutions
      const similaires  = found.filter(c => c.source === 'similar');
      const introuvables = found.filter(c => c.source === 'not_found');

      if (similaires.length > 0) {
        const msg = similaires.map(c =>
          `Je n'ai pas "${c.needed}" en stock — j'utilise "${c.nom}" qui s'en rapproche.`
        ).join('\n');
        setMessages(prev => [...prev, { role: 'assistant', content: msg }]);
      }
      if (introuvables.length > 0) {
        const msg = `Ces composants ne sont pas encore dans ma base : ${introuvables.map(c => c.needed).join(', ')}. Le rendu les montrera de façon générique.`;
        setMessages(prev => [...prev, { role: 'assistant', content: msg }]);
      }

      // ── 3. Génération du rendu depuis les vrais composants ───────────────────
      const renderRes = await fetch('/api/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ design: newDesign, components: found }),
      });
      if (!renderRes.ok) throw new Error('Erreur de génération.');
      const renderData = await renderRes.json();

      if (renderData.imageUrl) {
        setRenderedImage(renderData.imageUrl);
      } else {
        throw new Error(renderData.error || 'Aucune image générée.');
      }

      setGenerating(false);

    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: 'assistant', content: 'Oups — ' + err.message }]);
      setLoading(false);
      setGenerating(false);
    }
  };

  const isBusy = loading || generating;

  return (
    <>
      <Head>
        <title>Lucy — L'IA au service de la mode</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&family=Jost:wght@200;300;400&display=swap" rel="stylesheet" />
      </Head>

      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: C.ivory, fontFamily: "'Jost', sans-serif" }}>

        {/* NAV */}
        <nav style={{ height: 60, padding: '0 40px', borderBottom: '1px solid ' + C.beige, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, background: C.ivory }}>
          <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 300, letterSpacing: 6, textTransform: 'uppercase' }}>Lucy</span>
          <span style={{ fontSize: 10, fontWeight: 300, letterSpacing: 2.5, textTransform: 'uppercase', color: C.taupe }}>L'IA au service de la mode</span>
        </nav>

        {/* MAIN */}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', overflow: 'hidden' }}>

          {/* LEFT — CHAT */}
          <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid ' + C.beige, overflow: 'hidden' }}>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px 24px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {messages.map((msg, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  {msg.role === 'assistant' && (
                    <div style={{ width: 26, height: 26, background: C.noir, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Cormorant Garamond', serif", fontSize: 11, color: C.gold, marginRight: 10, flexShrink: 0, marginTop: 2 }}>L</div>
                  )}
                  <div style={{ maxWidth: '78%', padding: '10px 14px', background: msg.role === 'user' ? C.noir : C.beige, color: msg.role === 'user' ? C.ivory : C.noir, fontSize: 13, fontWeight: 300, lineHeight: 1.65, borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px', whiteSpace: 'pre-wrap' }}>
                    {msg.content}
                  </div>
                </div>
              ))}

              {/* Loading dots */}
              {(loading || generating) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 26, height: 26, background: C.noir, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Cormorant Garamond', serif", fontSize: 11, color: C.gold }}>L</div>
                  <div style={{ padding: '10px 14px', background: C.beige, borderRadius: '16px 16px 16px 4px', display: 'flex', gap: 5 }}>
                    {[0, 1, 2].map(i => (
                      <div key={i} style={{ width: 6, height: 6, background: C.taupe, borderRadius: '50%', animation: 'bounce 1.2s ease-in-out ' + (i * 0.2) + 's infinite' }} />
                    ))}
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Image preview */}
            {preview && (
              <div style={{ padding: '8px 24px', display: 'flex', alignItems: 'center', gap: 10, borderTop: '1px solid ' + C.beige }}>
                <img src={preview} alt="ref" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 4 }} />
                <span style={{ fontSize: 11, color: C.taupe, flex: 1 }}>Image de référence</span>
                <button onClick={() => { setPreview(null); setPendingImg(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.taupe, fontSize: 20 }}>×</button>
              </div>
            )}

            {/* Input */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid ' + C.beige, background: C.ivory, flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <button onClick={() => fileRef.current?.click()} disabled={isBusy} style={{ width: 42, height: 42, background: C.beige, border: '1px solid ' + C.sand, borderRadius: 6, cursor: isBusy ? 'not-allowed' : 'pointer', fontSize: 17, opacity: isBusy ? 0.5 : 1, flexShrink: 0 }}>🖼</button>
                <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder="Décris ton vêtement..."
                  disabled={isBusy}
                  rows={1}
                  style={{ flex: 1, padding: '11px 14px', background: C.beige, border: '1px solid ' + C.sand, borderRadius: 6, fontFamily: "'Jost', sans-serif", fontSize: 13, fontWeight: 300, color: C.noir, resize: 'none', height: 42, lineHeight: '20px', outline: 'none', opacity: isBusy ? 0.6 : 1 }}
                />
                <button
                  onClick={send}
                  disabled={isBusy || (!input.trim() && !pendingImg)}
                  style={{ width: 42, height: 42, background: (isBusy || (!input.trim() && !pendingImg)) ? C.sand : C.noir, border: 'none', borderRadius: 6, cursor: (isBusy || (!input.trim() && !pendingImg)) ? 'not-allowed' : 'pointer', color: C.ivory, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                >
                  {loading ? '⟳' : '→'}
                </button>
              </div>
              <div style={{ marginTop: 6, fontSize: 10, color: C.taupe, textAlign: 'center', letterSpacing: 1 }}>Entrée pour envoyer · ⇧+Entrée pour saut de ligne</div>
            </div>
          </div>

          {/* RIGHT — RENDU + COMPOSANTS */}
          <div style={{ overflowY: 'auto', padding: 28, display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* Zone image */}
            <div style={{ background: C.beige, borderRadius: 4, minHeight: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
              {renderedImage ? (
                <img src={renderedImage} alt="Rendu Lucy" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 4 }} />
              ) : generating ? (
                <div style={{ textAlign: 'center', padding: 40 }}>
                  <div style={{ width: 40, height: 40, border: '2px solid ' + C.sand, borderTop: '2px solid ' + C.gold, borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 20px' }} />
                  <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, fontWeight: 300, color: C.mink, letterSpacing: 2, marginBottom: 8 }}>Création du rendu...</div>
                  <div style={{ fontSize: 10, color: C.taupe, letterSpacing: 1.5, textTransform: 'uppercase' }}>Shooting photo en cours ✦</div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: 40 }}>
                  <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 80, fontWeight: 300, color: 'rgba(0,0,0,0.04)', lineHeight: 1 }}>L</div>
                  <div style={{ fontSize: 10, fontWeight: 300, letterSpacing: 2.5, textTransform: 'uppercase', color: C.taupe, marginTop: 16 }}>Le rendu apparaîtra ici</div>
                </div>
              )}
            </div>

            {/* Design summary */}
            {design && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 300, letterSpacing: 3, textTransform: 'uppercase', color: C.gold, marginBottom: 10 }}>Ton design</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {[['Type', design.type], ['Matière', design.matiere], ['Coupe', design.coupe], ['Couleur', design.couleur], ['Style', design.style]].filter(([, v]) => v).map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', gap: 12, fontSize: 12, lineHeight: 1.5 }}>
                      <span style={{ color: C.taupe, width: 58, flexShrink: 0 }}>{k}</span>
                      <span style={{ color: C.noir }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Composants */}
            {components.length > 0 && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 300, letterSpacing: 3, textTransform: 'uppercase', color: C.gold, marginBottom: 12 }}>Composants du vêtement</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {components.map((comp, i) => {
                    const badge = BADGE[comp.source] || BADGE.not_found;
                    return (
                      <div key={i} style={{ padding: '12px 14px', background: C.beige, borderRadius: 4, display: 'flex', alignItems: 'center', gap: 12, border: '1px solid ' + C.sand }}>
                        {comp.photo ? (
                          <img src={comp.photo} alt={comp.nom} style={{ width: 42, height: 42, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }} />
                        ) : (
                          <div style={{ width: 42, height: 42, background: C.sand, borderRadius: 3, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🧵</div>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 400, color: C.noir, marginBottom: 2 }}>{comp.nom || comp.needed}</div>
                          <div style={{ fontSize: 10, color: C.taupe, marginBottom: 5 }}>
                            {[comp.type, comp.composition, comp.couleur, comp.prix].filter(Boolean).join(' · ')}
                          </div>
                          <span style={{ display: 'inline-block', padding: '2px 7px', background: badge.bg, color: '#fff', fontSize: 9, letterSpacing: 1, borderRadius: 3 }}>
                            {badge.label}
                          </span>
                          {comp.source === 'similar' && (
                            <div style={{ fontSize: 9, color: C.taupe, marginTop: 3, fontStyle: 'italic' }}>Demandé : {comp.needed}</div>
                          )}
                          {comp.source === 'not_found' && (
                            <div style={{ fontSize: 9, color: C.taupe, marginTop: 3, fontStyle: 'italic' }}>Ce composant sera à sourcer à Guangzhou</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Boutons commander */}
            {renderedImage && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 300, letterSpacing: 3, textTransform: 'uppercase', color: C.gold }}>Prêt à concrétiser ?</div>
                <a
                  href={'mailto:' + (process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'contact@lucy.ai') + '?subject=Commander mon vêtement Lucy&body=Type: ' + (design?.type || '') + '%0AMatière: ' + (design?.matiere || '') + '%0ACoupe: ' + (design?.coupe || '') + '%0ACouleur: ' + (design?.couleur || '')}
                  style={{ display: 'block', padding: '15px 24px', background: C.noir, color: C.ivory, textDecoration: 'none', textAlign: 'center', fontSize: 11, fontWeight: 300, letterSpacing: 2.5, textTransform: 'uppercase', borderRadius: 4 }}
                >
                  👕 Commander mon vêtement
                </a>
                <a
                  href={'mailto:' + (process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'contact@lucy.ai') + '?subject=Commander des échantillons Lucy&body=Matière: ' + (design?.matiere || '') + '%0ACouleur: ' + (design?.couleur || '')}
                  style={{ display: 'block', padding: '15px 24px', background: 'transparent', color: C.noir, textDecoration: 'none', textAlign: 'center', fontSize: 11, fontWeight: 300, letterSpacing: 2.5, textTransform: 'uppercase', border: '1px solid ' + C.sand, borderRadius: 4 }}
                >
                  🧵 Commander des échantillons
                </a>
                <p style={{ fontSize: 10, color: C.taupe, textAlign: 'center', lineHeight: 1.5 }}>Tu peux continuer à affiner ton design en écrivant à Lucy.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
