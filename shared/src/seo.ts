/**
 * Search/marketing copy, in one place. The server renders it into the HTML (so
 * crawlers see real text without running JS) and the React screens render the
 * same data, so what search engines index is exactly what players see.
 */

export const SITE_NAME = 'Goli';

export interface PageMeta {
  /** <title>: what shows in search results. */
  title: string;
  /** Meta description: the snippet under the title. */
  description: string;
  /** Link-preview title (WhatsApp etc.), shorter. */
  ogTitle: string;
}

export const HOME_META: PageMeta = {
  title: 'Goli – Free Online Multiplayer Marbles Game | Play with Friends',
  description:
    'Play Goli, the classic Indian marbles game (goli, kancha, kanche), online with up to 10 friends. Free, no download, no sign-up: share a link, join from any phone and knock the goli out of the ring.',
  ogTitle: 'Goli: the marbles game, online with friends',
};

export const HOW_TO_META: PageMeta = {
  title: 'How to Play Goli (Marbles) – Rules, Points and Tips | Goli',
  description:
    'Learn to play Goli, the traditional marbles game: how to aim and flick the striker, what each colour is worth, the red Raja bonus, fouls and tips to win. Then play free online with friends.',
  ogTitle: 'How to play Goli (marbles)',
};

export const PRACTICE_META: PageMeta = {
  title: 'Practice Goli – Marbles Game on One Phone | Goli',
  description: 'Practise the Goli marbles game on your phone: 1 to 4 players take turns on the same screen. Free, no download.',
  ogTitle: 'Practice Goli on your phone',
};

export const HOME_INTRO = {
  heading: 'A free multiplayer marbles game for friends',
  body: [
    'Goli brings the marbles game from the school ground to your phone. Create a game, share the link on WhatsApp and up to 10 friends join in seconds. There is no app to install and no account to make.',
    'Everyone plays in the same ring, taking turns to flick the striker and knock the goli out. It is one of the quickest online multiplayer games to start with a group, whether you are in the same room or far apart.',
  ],
};

export const HOME_FEATURES = {
  heading: 'Why people play Goli',
  items: [
    'Free online game that plays in any browser',
    'Multiplayer: 2 to 10 players in one game, plus spectators',
    'No download, no sign-up: join with a link or a QR code',
    'Made for phones: one-finger catapult aiming on Android and iPhone',
    'Voice chat: the shooter can talk while everyone watches',
    'Real physics on a sunlit laterite ground, with glass cat’s-eye marbles',
  ],
};

export const HOME_HOW = {
  heading: 'How to play, in short',
  items: [
    'Slide your striker along the dashed line, pull it back like a catapult and let go.',
    'Knock goli out of the ring to keep them: white 1 point, green 2, blue 3.',
    'Hit the red Raja in the centre for 5 points and one more shot.',
    'If your striker rolls off the ground it is a foul, and the goli go back in.',
    'When the ring is empty, the most points wins.',
  ],
};

export const FAQ: { q: string; a: string }[] = [
  { q: 'Is Goli free to play?', a: 'Yes. Goli is free to play in your browser, with no download and no account.' },
  {
    q: 'How do I play Goli with friends online?',
    a: 'Tap Create game, then Invite to share the link (or show the QR code). Friends open it, pick a name and tap Join, and the host taps Start.',
  },
  { q: 'How many players can play?', a: '2 to 10 players in one game. Up to 20 more can watch and get a seat in the next round.' },
  {
    q: 'What is goli?',
    a: 'Goli, also called kancha, kanche, golli or simply marbles, is a traditional street game played across India with glass marbles in a ring drawn in the soil.',
  },
  { q: 'Does Goli work on mobile phones?', a: 'Yes. It is built for phones first, and also works on tablets and computers.' },
  { q: 'Can I play alone?', a: 'Yes. Practice mode lets 1 to 4 players take turns on the same phone.' },
];

export const HOW_TO_ARTICLE = {
  heading: 'How to play Goli (marbles)',
  intro:
    'Goli is the marbles game children play on school grounds and village streets across India. A ring is scratched into the soil, everyone puts in their goli, and players take turns to flick a bigger marble, the striker, to knock them out of the ring. Here is how it works on Goli online.',
  sections: [
    {
      heading: 'Setting up',
      paragraphs: [
        'Each player puts 2 goli into the ring, laid out in a star pattern. The red Raja sits in the very centre. The turn order is random, and then play goes around the table.',
      ],
    },
    {
      heading: 'Taking your shot',
      steps: [
        'Drag anywhere on the ground to slide your striker along the dashed throw line.',
        'Press on the striker and pull back like a catapult. The further you pull, the harder the shot.',
        'Let go to shoot. You have 15 seconds for each shot, and one shot per turn.',
      ],
    },
    {
      heading: 'Points',
      items: [
        'White goli on the outer ring: 1 point.',
        'Green goli in the middle: 2 points.',
        'Blue goli near the centre: 3 points.',
        'The red Raja in the centre: 5 points and one extra shot, from where your striker stopped.',
      ],
    },
    {
      heading: 'Fouls',
      paragraphs: ['If your striker rolls off the ground, it is a foul: that shot scores nothing and any goli it knocked out go back into the ring.'],
    },
    {
      heading: 'Winning',
      paragraphs: ['The game ends when the ring is empty. The player with the most points wins, and ties share the win.'],
    },
    {
      heading: 'Tips',
      items: [
        'The soil is rough: goli do not roll far, so hit firmly.',
        'Clip a goli near the edge at an angle to push it out of the ring.',
        'The deeper a goli sits, the more it is worth, but the harder it is to reach.',
        'Save a clean line at the Raja for the bonus shot.',
      ],
    },
    {
      heading: 'Play with friends',
      paragraphs: [
        'Open Goli, tap Create game and share the link. Up to 10 friends can join from their phones, with no sign-up, and the shooter can even talk over voice chat.',
      ],
    },
  ],
};

// ---- HTML for the server (all text above is ours, but escape anyway) ----

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const list = (items: string[], ordered = false) =>
  `<${ordered ? 'ol' : 'ul'}>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`;

export function homeSeoHtml(): string {
  return (
    `<main class="seo-static">` +
    `<h1>Goli: the free online multiplayer marbles game</h1>` +
    `<p><a href="/">Create a game</a> and play with up to 10 friends. No download, no sign-up.</p>` +
    `<h2>${esc(HOME_INTRO.heading)}</h2>${HOME_INTRO.body.map((p) => `<p>${esc(p)}</p>`).join('')}` +
    `<h2>${esc(HOME_FEATURES.heading)}</h2>${list(HOME_FEATURES.items)}` +
    `<h2>${esc(HOME_HOW.heading)}</h2>${list(HOME_HOW.items)}<p><a href="/how-to-play">Read the full rules</a></p>` +
    `<h2>Questions</h2>${FAQ.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join('')}` +
    `</main>`
  );
}

export function howToSeoHtml(): string {
  const a = HOW_TO_ARTICLE;
  const body = a.sections
    .map((s) => {
      const parts = [`<h2>${esc(s.heading)}</h2>`];
      if ('paragraphs' in s && s.paragraphs) parts.push(...s.paragraphs.map((p) => `<p>${esc(p)}</p>`));
      if ('steps' in s && s.steps) parts.push(list(s.steps, true));
      if ('items' in s && s.items) parts.push(list(s.items));
      return parts.join('');
    })
    .join('');
  return `<main class="seo-static"><h1>${esc(a.heading)}</h1><p>${esc(a.intro)}</p>${body}<p><a href="/">Play Goli now</a></p></main>`;
}

/** schema.org structured data (JSON-LD) so search engines know what the site is. */
export function homeJsonLd(origin: string): object[] {
  return [
    { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE_NAME, url: `${origin}/` },
    {
      '@context': 'https://schema.org',
      '@type': 'VideoGame',
      name: SITE_NAME,
      alternateName: ['Goli marbles', 'Kancha', 'Kanche', 'Marbles game online'],
      url: `${origin}/`,
      image: `${origin}/og.png`,
      description: HOME_META.description,
      genre: ['Casual', 'Party', 'Sports', 'Traditional'],
      playMode: ['MultiPlayer', 'SinglePlayer'],
      numberOfPlayers: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 10 },
      gamePlatform: ['Web browser', 'Android', 'iOS'],
      applicationCategory: 'GameApplication',
      operatingSystem: 'Any (runs in the browser)',
      inLanguage: 'en',
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR' },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    },
  ];
}

export function howToJsonLd(origin: string): object[] {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: HOW_TO_ARTICLE.heading,
      description: HOW_TO_META.description,
      image: `${origin}/og.png`,
      mainEntityOfPage: `${origin}/how-to-play`,
      publisher: { '@type': 'Organization', name: SITE_NAME, logo: { '@type': 'ImageObject', url: `${origin}/icon-512.png` } },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: SITE_NAME, item: `${origin}/` },
        { '@type': 'ListItem', position: 2, name: 'How to play', item: `${origin}/how-to-play` },
      ],
    },
  ];
}
