import { useState, useRef, useEffect } from 'react';
import Head from 'next/head';

const C = {
  ivory: '#FAF8F4',
  beige: '#EDE8DF',
  sand: '#D6CCBC',
  taupe: '#A89B8C',
  mink: '#6B5E52',
  noir: '#1C1714',
  gold: '#C4A97D',
  goldLt: '#E8D9C0',
  green: '#2D6A4F',
};

export default function Lucy() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'Bonjour ! Je suis Lucy. Décris-moi le vêtement que tu souhaites créer, ou uploade une photo d\'un vêtement qui t\'inspire et je le reproduis avec mes matières disponibles.',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [design, setDesign] = useState(null);
  const [components, setComponents] = useState([]);
  const [renderedImage, setRenderedImage] = useState(null);
  const [uploadedPreview, setUploadedPreview] = useState(null);
  const [pendingImage, setPendingImage] = useState(null); // { base64, mediaType }
  const [error, setError] = useState(null);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result.split(',')[1];
      setUploadedPreview(reader.result);
      setPendingImage({ base64, mediaType: file.type });
    };
    reader.readAsDataURL(file);
    // Reset file input so same file can be re-selected
    e.target.value = '';
  };

  const sendMessage = async (text, imgData = null) => {
    const trimmed = text.trim();
    if (!trimmed && !imgData) return;

    setError(null);
    const imageToSend = imgData || pendingImage;
    const userContent = trimmed || 'Reproduis ce vêtement avec tes matières disponibles.';

    const userMessage = { role: 'user', content: userContent };
    const newMessages = [...messages, userMessage];

    setMessages(newMessages);
    setInput('');
    setPendingImage(null);
    setUploadedPreview(null);
    setLoading(true);

    try {
      const chatRes = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          imageBase64: imageToSend?.base64 || null,
          imageMediaType: imageToSend?.mediaType || 'image/jpeg',
        }),
      });

      if (!chatRes.ok) throw new Error('Erreur serveur — réessaie.');
      const chatData = await chatRes.json();

      if (chatData.type === 'design') {
        // Design complete — start generation
        const newDesign = chatData.data.design;
        setDesign(newDesign);
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: chatData.data.message,
        }]);
        setLoading(false);
        setGeneratingImage(true);

        // Étape 1 — Composants Airtable EN PREMIER
        const compRes = await fetch('/api/components', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ design: newDesign }),
        });
        const compData = await compRes.json();
        const foundComponents = compData.components || [];
        setComponents(foundComponents);

        // Étape 2 — Notifie l'user sur les substitutions
        const substitues = foundComponents.filter(c => c.source === 'similar');
        const aSourcer = foundComponents.filter(c => c.source === 'a_creer');

        if (substitues.length > 0) {
          const msg = substitues.map(c =>
            `Je n'ai pas de "${c.originalNeed}" en stock — j'utilise "${c.nom}" (${c.composition || c.type}) qui s'en rapproche.`
          ).join('\n');
          setMessages(prev => [...prev, { role: 'assistant', content: msg }]);
        }
        if (aSourcer.length > 0) {
          const msg2 = aSourcer.map(c =>
            `"${c.originalNeed}" n'est pas encore dans ma base — ce composant sera à sourcer.`
          ).join('\n');
          setMessages(prev => [...prev, { role: 'assistant', content: msg2 }]);
        }

        // Étape 3 — Reconstruit le prompt avec les composants RÉELS
        const tissuReel = foundComponents.find(c => c.type === 'Tissu');
        const zipReel = foundComponents.find(c => c.type === 'Fermeture');
        const matiereReelle = tissuReel?.composition || newDesign.matiere;
        const couleurReelle = tissuReel?.couleur || newDesign.couleur;

        let promptFinal = newDesign.prompt_image;
        // Remplace matière et couleur demandées par les vraies de la base
        promptFinal = promptFinal.replace(new RegExp(newDesign.matiere, 'gi'), matiereReelle);
        promptFinal = promptFinal.replace(new RegExp(newDesign.couleur, 'gi'), couleurReelle);
        // Remplace la couleur du zip si on en a un réel
        if (zipReel?.couleur) {
          promptFinal = promptFinal.replace(/zipper/gi, `${zipReel.couleur} zipper`);
        }

        const designFinal = {
          ...newDesign,
          matiere: matiereReelle,
          couleur: couleurReelle,
          prompt_image: promptFinal,
        };

        // Étape 4 — Génère le rendu avec les vraies matières
        const renderRes = await fetch('/api/render', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ design: designFinal }),
        });

        if (!renderRes.ok) throw new Error('Erreur de génération d\'image.');
        const renderData = await renderRes.json();

        if (renderData.imageUrl) {
          setRenderedImage(renderData.imageUrl);
        } else {
          throw new Error(renderData.error || 'Aucune image générée.');
        }

        setGeneratingImage(false);

      } else {
        // Regular conversation
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: chatData.content,
        }]);
        setLoading(false);
      }

    } catch (err) {
      console.error(err);
      setError(err.message);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Oups — ${err.message}`,
      }]);
      setLoading(false);
      setGeneratingImage(false);
    }
  };

  const handleSend = () => sendMessage(input);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isBusy = loading || generatingImage;

  return (
    <>
      <Head>
        <title>Lucy — L'IA au service de la mode</title>
        <meta name="description" content="Crée ton vêtement sur mesure avec Lucy, l'IA au service de la mode." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&family=Jost:wght@200;300;400&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: C.ivory, fontFamily: "'Jost', sans-serif" }}>

        {/* ── NAV ── */}
        <nav style={{
          padding: '0 40px',
          height: '60px',
          borderBottom: `1px solid ${C.beige}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          background: C.ivory,
        }}>
          <span style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: '20px',
            fontWeight: 300,
            letterSpacing: '6px',
            textTransform: 'uppercase',
            color: C.noir,
          }}>Lucy</span>
          <span style={{
            fontSize: '10px',
            fontWeight: 300,
            letterSpacing: '2.5px',
            textTransform: 'uppercase',
            color: C.taupe,
          }}>L'IA au service de la mode</span>
        </nav>

        {/* ── MAIN ── */}
        <div style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          overflow: 'hidden',
        }}>

          {/* ── LEFT — CHAT ── */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            borderRight: `1px solid ${C.beige}`,
            overflow: 'hidden',
          }}>
            {/* Messages */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '28px 28px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}>
              {messages.map((msg, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    animation: 'fadeIn 0.3s ease',
                  }}
                >
                  {msg.role === 'assistant' && (
                    <div style={{
                      width: '26px', height: '26px',
                      background: C.noir, borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: "'Cormorant Garamond', serif",
                      fontSize: '11px', color: C.gold,
                      marginRight: '10px', flexShrink: 0, marginTop: '2px',
                    }}>L</div>
                  )}
                  <div style={{
                    maxWidth: '78%',
                    padding: '11px 15px',
                    background: msg.role === 'user' ? C.noir : C.beige,
                    color: msg.role === 'user' ? C.ivory : C.noir,
                    fontSize: '13px',
                    fontWeight: 300,
                    lineHeight: 1.65,
                    borderRadius: msg.role === 'user'
                      ? '16px 16px 4px 16px'
                      : '16px 16px 16px 4px',
                  }}>
                    {msg.content}
                  </div>
                </div>
              ))}

              {/* Loading dots */}
              {loading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '26px', height: '26px', background: C.noir, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: "'Cormorant Garamond', serif", fontSize: '11px', color: C.gold,
                  }}>L</div>
                  <div style={{
                    padding: '12px 16px', background: C.beige,
                    borderRadius: '16px 16px 16px 4px',
                    display: 'flex', gap: '5px', alignItems: 'center',
                  }}>
                    {[0, 1, 2].map(i => (
                      <div key={i} style={{
                        width: '6px', height: '6px',
                        background: C.taupe, borderRadius: '50%',
                        animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                      }} />
                    ))}
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Image preview */}
            {uploadedPreview && (
              <div style={{
                padding: '8px 28px',
                display: 'flex', alignItems: 'center', gap: '10px',
                borderTop: `1px solid ${C.beige}`,
              }}>
                <img
                  src={uploadedPreview}
                  alt="référence"
                  style={{ width: '44px', height: '44px', objectFit: 'cover', borderRadius: '4px' }}
                />
                <span style={{ fontSize: '11px', color: C.taupe, letterSpacing: '1px', flex: 1 }}>
                  Image de référence prête
                </span>
                <button
                  onClick={() => { setUploadedPreview(null); setPendingImage(null); }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: C.taupe, fontSize: '18px', lineHeight: 1,
                  }}
                >×</button>
              </div>
            )}

            {/* Input bar */}
            <div style={{
              padding: '16px 28px',
              borderTop: `1px solid ${C.beige}`,
              background: C.ivory,
              flexShrink: 0,
            }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>

                {/* Upload button */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isBusy}
                  title="Uploader une image de référence"
                  style={{
                    width: '42px', height: '42px', flexShrink: 0,
                    background: C.beige,
                    border: `1px solid ${C.sand}`,
                    borderRadius: '6px',
                    cursor: isBusy ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '17px',
                    opacity: isBusy ? 0.5 : 1,
                    transition: 'opacity 0.2s',
                  }}
                >🖼</button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleImageSelect}
                  style={{ display: 'none' }}
                />

                {/* Text input */}
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Décris ton vêtement... (Ex: veste noire oversize en coton)"
                  disabled={isBusy}
                  rows={1}
                  style={{
                    flex: 1,
                    padding: '11px 14px',
                    background: C.beige,
                    border: `1px solid ${C.sand}`,
                    borderRadius: '6px',
                    fontFamily: "'Jost', sans-serif",
                    fontSize: '13px', fontWeight: 300,
                    color: C.noir,
                    resize: 'none',
                    height: '42px',
                    lineHeight: '20px',
                    opacity: isBusy ? 0.6 : 1,
                  }}
                />

                {/* Send button */}
                <button
                  onClick={handleSend}
                  disabled={isBusy || (!input.trim() && !pendingImage)}
                  style={{
                    width: '42px', height: '42px', flexShrink: 0,
                    background: (isBusy || (!input.trim() && !pendingImage)) ? C.sand : C.noir,
                    border: 'none', borderRadius: '6px',
                    cursor: (isBusy || (!input.trim() && !pendingImage)) ? 'not-allowed' : 'pointer',
                    color: C.ivory, fontSize: '18px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'background 0.2s',
                  }}
                >
                  {loading ? (
                    <div style={{
                      width: '16px', height: '16px',
                      border: `2px solid rgba(255,255,255,0.3)`,
                      borderTop: `2px solid ${C.ivory}`,
                      borderRadius: '50%',
                      animation: 'spin 0.8s linear infinite',
                    }} />
                  ) : '→'}
                </button>
              </div>
              <div style={{
                marginTop: '8px',
                fontSize: '10px', fontWeight: 300,
                letterSpacing: '1px', color: C.taupe,
                textAlign: 'center',
              }}>
                Entrée pour envoyer · ⇧ Entrée pour retour à la ligne
              </div>
            </div>
          </div>

          {/* ── RIGHT — RENDER + COMPOSANTS ── */}
          <div style={{ overflowY: 'auto', padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* Image zone */}
            <div style={{
              background: C.beige,
              borderRadius: '4px',
              minHeight: '380px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              overflow: 'hidden',
              flexShrink: 0,
            }}>
              {renderedImage ? (
                <img
                  src={renderedImage}
                  alt="Rendu Lucy"
                  style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '4px', animation: 'fadeIn 0.5s ease' }}
                />
              ) : generatingImage ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                  <div style={{
                    width: '40px', height: '40px',
                    border: `2px solid ${C.sand}`,
                    borderTop: `2px solid ${C.gold}`,
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                    margin: '0 auto 20px',
                  }} />
                  <div style={{
                    fontFamily: "'Cormorant Garamond', serif",
                    fontSize: '18px', fontWeight: 300,
                    color: C.mink, letterSpacing: '2px', marginBottom: '8px',
                  }}>
                    Génération en cours...
                  </div>
                  <div style={{ fontSize: '10px', color: C.taupe, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
                    ~20 secondes
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                  <div style={{
                    fontFamily: "'Cormorant Garamond', serif",
                    fontSize: '72px', fontWeight: 300,
                    color: 'rgba(0,0,0,0.05)', letterSpacing: '4px', lineHeight: 1,
                  }}>L</div>
                  <div style={{
                    fontSize: '10px', fontWeight: 300,
                    letterSpacing: '2.5px', textTransform: 'uppercase',
                    color: C.taupe, marginTop: '16px',
                  }}>Le rendu apparaîtra ici</div>
                </div>
              )}
            </div>

            {/* Design summary */}
            {design && (
              <div style={{ animation: 'fadeIn 0.4s ease' }}>
                <div style={{
                  fontSize: '10px', fontWeight: 300, letterSpacing: '3px',
                  textTransform: 'uppercase', color: C.gold, marginBottom: '10px',
                }}>Ton design</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {[
                    ['Type', design.type],
                    ['Matière', design.matiere],
                    ['Coupe', design.coupe],
                    ['Couleur', design.couleur],
                    ['Style', design.style],
                    ['Détails', design.details],
                  ].filter(([, v]) => v).map(([label, value]) => (
                    <div key={label} style={{ display: 'flex', gap: '12px', fontSize: '12px', lineHeight: 1.5 }}>
                      <span style={{ color: C.taupe, fontWeight: 300, width: '58px', flexShrink: 0 }}>{label}</span>
                      <span style={{ color: C.noir, fontWeight: 300 }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Components */}
            {components.length > 0 && (
              <div style={{ animation: 'fadeIn 0.4s ease' }}>
                <div style={{
                  fontSize: '10px', fontWeight: 300, letterSpacing: '3px',
                  textTransform: 'uppercase', color: C.gold, marginBottom: '12px',
                }}>Composants utilisés</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {components.map((comp, i) => {
                    const sourceBg = {
                      base:     C.green,
                      similar:  C.gold,
                      web:      C.steel || '#457B9D',
                      a_creer:  C.taupe,
                    }[comp.source] || C.taupe;

                    return (
                      <div key={i} style={{
                        padding: '12px 14px',
                        background: C.beige,
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        border: `1px solid ${C.sand}`,
                      }}>
                        {comp.photo ? (
                          <img
                            src={comp.photo}
                            alt={comp.nom}
                            style={{ width: '38px', height: '38px', objectFit: 'cover', borderRadius: '3px', flexShrink: 0 }}
                          />
                        ) : (
                          <div style={{
                            width: '38px', height: '38px', background: C.sand,
                            borderRadius: '3px', flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '16px',
                          }}>🧵</div>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '12px', fontWeight: 400, color: C.noir, marginBottom: '3px' }}>
                            {comp.nom}
                          </div>
                          <div style={{ fontSize: '10px', fontWeight: 300, color: C.taupe, letterSpacing: '0.5px', marginBottom: '5px' }}>
                            {[comp.type, comp.composition, comp.prix].filter(Boolean).join(' · ')}
                          </div>
                          {/* Source badge */}
                          <span style={{
                            display: 'inline-block',
                            padding: '2px 7px',
                            background: sourceBg,
                            color: '#fff',
                            fontSize: '9px',
                            fontWeight: 300,
                            letterSpacing: '1px',
                            borderRadius: '3px',
                          }}>
                            {comp.sourceLabel}
                          </span>
                          {comp.originalNeed && comp.source === 'similar' && (
                            <div style={{ fontSize: '9px', color: C.taupe, marginTop: '3px', fontStyle: 'italic' }}>
                              Recherché : {comp.originalNeed}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* No components found message */}
            {design && components.length === 0 && !generatingImage && (
              <div style={{
                padding: '16px', background: C.beige, borderRadius: '4px',
                fontSize: '12px', color: C.taupe, fontWeight: 300, lineHeight: 1.6,
              }}>
                Aucun composant exact trouvé dans la base — enrichis ta base Airtable pour plus de résultats.
              </div>
            )}

            {/* Order buttons */}
            {renderedImage && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', animation: 'fadeIn 0.5s ease' }}>
                <div style={{
                  fontSize: '10px', fontWeight: 300, letterSpacing: '3px',
                  textTransform: 'uppercase', color: C.gold, marginBottom: '2px',
                }}>Prêt à concrétiser ?</div>

                <a
                  href={`mailto:${process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'contact@lucy.ai'}?subject=Commander mon vêtement Lucy&body=Bonjour, je souhaite commander le vêtement suivant:%0A%0AType: ${design?.type || ''}%0AMatière: ${design?.matiere || ''}%0ACoupe: ${design?.coupe || ''}%0ACouleur: ${design?.couleur || ''}%0ADétails: ${design?.details || ''}`}
                  style={{
                    display: 'block',
                    padding: '15px 24px',
                    background: C.noir, color: C.ivory,
                    textDecoration: 'none', textAlign: 'center',
                    fontSize: '11px', fontWeight: 300,
                    letterSpacing: '2.5px', textTransform: 'uppercase',
                    borderRadius: '4px',
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={e => e.target.style.background = C.mink}
                  onMouseLeave={e => e.target.style.background = C.noir}
                >
                  👕 Commander mon vêtement
                </a>

                <a
                  href={`mailto:${process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'contact@lucy.ai'}?subject=Commander des échantillons Lucy&body=Bonjour, je souhaite commander des échantillons des matières suivantes:%0A%0AType: ${design?.type || ''}%0AMatière: ${design?.matiere || ''}%0ACouleur: ${design?.couleur || ''}`}
                  style={{
                    display: 'block',
                    padding: '15px 24px',
                    background: 'transparent', color: C.noir,
                    textDecoration: 'none', textAlign: 'center',
                    fontSize: '11px', fontWeight: 300,
                    letterSpacing: '2.5px', textTransform: 'uppercase',
                    border: `1px solid ${C.sand}`,
                    borderRadius: '4px',
                  }}
                >
                  🧵 Commander des échantillons
                </a>

                <p style={{
                  fontSize: '10px', fontWeight: 300, color: C.taupe,
                  textAlign: 'center', letterSpacing: '0.5px', lineHeight: 1.5,
                }}>
                  Tu peux aussi continuer à affiner ton design en écrivant à Lucy.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
