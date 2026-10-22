// 🪪 📰 📊 profile links for the slideout header.
// 2026-10-22 (user): 🪪 bio · 📰 news · 📊 stats badges next to the name in the slideout; each opens in a new tab.
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
const q = (s) => encodeURIComponent(fold(s))
const news = (name, league) => `https://news.google.com/search?q=${encodeURIComponent(`"${fold(name)}" ${league}`)}`
const badgeStyle = { textDecoration: 'none', fontSize: 15, lineHeight: 1, padding: '2px 3px', borderRadius: 6 }
function Badges({ links }) {
  return (
    <span className="profile-links" style={{ display: 'inline-flex', gap: 4, marginLeft: 6, verticalAlign: 'middle' }}>
      {links.filter((l) => l.href).map((l) => (
        <a key={l.icon} href={l.href} target="_blank" rel="noopener noreferrer" title={l.title} aria-label={l.title} style={badgeStyle}
          onClick={(e) => e.stopPropagation()}>{l.icon}</a>
      ))}
    </span>
  )
}

// Slap Shot: NHL.com player page (bio + stats), Google News, Hockey-Reference (standard + advanced; its search jumps to the player)
export default function ProfileLinks({ p }) {
  return <Badges links={[
    { icon: '🪪', title: `${p.name} — bio (NHL.com)`, href: p.playerId ? `https://www.nhl.com/player/${p.playerId}` : null },
    { icon: '📰', title: `${p.name} — latest news`, href: news(p.name, 'NHL') },
    { icon: '📊', title: `${p.name} — standard + advanced stats (Hockey-Reference)`, href: `https://www.hockey-reference.com/search/search.fcgi?search=${q(p.name)}` },
  ]} />
}
