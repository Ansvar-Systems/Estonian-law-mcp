/**
 * XML parser for Estonian legislation from Riigi Teataja.
 *
 * The official machine-readable endpoint serves statutes at:
 *   https://www.riigiteataja.ee/akt/{ACT_ID}.xml
 *
 * The parser extracts:
 * - statute metadata (title, dates, short name)
 * - provisions by § (paragrahv)
 * - chapter context where available
 * - definition entries from explicit "Mõisted" provisions
 */

export interface TargetLaw {
  id: string;
  seedFile: string;
  sourceUrl: string;
  titleEn: string;
  shortName?: string;
  description: string;
  status: 'in_force' | 'amended' | 'repealed' | 'not_yet_in_force';
}

export interface ParsedProvision {
  provision_ref: string;
  chapter?: string;
  section: string;
  title: string;
  content: string;
}

export interface ParsedDefinition {
  term: string;
  definition: string;
  source_provision?: string;
}

export interface ParsedAct {
  id: string;
  type: 'statute';
  title: string;
  title_en: string;
  short_name: string;
  status: 'in_force' | 'amended' | 'repealed' | 'not_yet_in_force';
  issued_date: string;
  in_force_date: string;
  url: string;
  description: string;
  provisions: ParsedProvision[];
  definitions: ParsedDefinition[];
}

export const TARGET_LAWS: TargetLaw[] = [
  {
    id: 'iks',
    seedFile: '01-personal-data-protection-act.json',
    sourceUrl: 'https://www.riigiteataja.ee/akt/112072025014.xml',
    titleEn: 'Personal Data Protection Act',
    shortName: 'IKS',
    description: 'Estonia\'s core personal data protection statute. It supplements GDPR and sets national rules for supervision, processing grounds, and safeguards.',
    status: 'in_force',
  },
  {
    id: 'cybersecurity-act',
    seedFile: '02-cybersecurity-act.json',
    sourceUrl: 'https://www.riigiteataja.ee/akt/130122025015.xml',
    titleEn: 'Cybersecurity Act',
    shortName: 'KüTS',
    description: 'Framework law for cybersecurity governance and obligations in Estonia, including requirements on network and information system security and supervision.',
    status: 'in_force',
  },
  {
    id: 'electronic-communications-act',
    seedFile: '03-electronic-communications-act.json',
    sourceUrl: 'https://www.riigiteataja.ee/akt/130122025018.xml',
    titleEn: 'Electronic Communications Act',
    shortName: 'ESS',
    description: 'Regulates electronic communications networks and services, including provider obligations, user rights, and supervisory powers.',
    status: 'in_force',
  },
  {
    id: 'info-society-services-act',
    seedFile: '04-information-society-services-act.json',
    sourceUrl: 'https://www.riigiteataja.ee/akt/104072024024.xml',
    titleEn: 'Information Society Services Act',
    shortName: 'InfoTS',
    description: 'Sets legal requirements for information society services, including service provider duties and liability rules in digital services contexts.',
    status: 'in_force',
  },
  {
    id: 'public-information-act',
    seedFile: '05-public-information-act.json',
    sourceUrl: 'https://www.riigiteataja.ee/akt/105072025003.xml',
    titleEn: 'Public Information Act',
    shortName: 'AvTS',
    description: 'Establishes public access to information held by authorities, proactive publication duties, and data management obligations.',
    status: 'in_force',
  },
  {
    id: 'eidas-trust-services-act',
    seedFile: '06-eidas-trust-services-act.json',
    sourceUrl: 'https://www.riigiteataja.ee/akt/130122025016.xml',
    titleEn: 'E-Identification and Trust Services for Electronic Transactions Act',
    shortName: 'EUTS',
    description: 'Implements national rules around e-identification and trust services in alignment with Regulation (EU) No 910/2014 (eIDAS).',
    status: 'in_force',
  },
  {
    id: 'identity-documents-act',
    seedFile: '07-identity-documents-act.json',
    sourceUrl: 'https://www.riigiteataja.ee/akt/126062025006.xml',
    titleEn: 'Identity Documents Act',
    shortName: 'ITDS',
    description: 'Regulates identity documents and related issuance, use, and verification rules, including digital identity credentials.',
    status: 'in_force',
  },
  {
    id: 'penal-code-cyber',
    seedFile: '08-penal-code-cyber.json',
    sourceUrl: 'https://www.riigiteataja.ee/akt/122122025002.xml',
    titleEn: 'Penal Code',
    shortName: 'KarS',
    description: 'Estonia\'s Penal Code, including criminal law provisions relevant to cybercrime, data offences, and unlawful system interference.',
    status: 'in_force',
  },
  {
    id: 'trade-secrets-act',
    seedFile: '09-trade-secrets-act.json',
    sourceUrl: 'https://www.riigiteataja.ee/akt/107122018002.xml',
    titleEn: 'Anti-Unfair Competition and Trade Secrets Protection Act',
    shortName: 'EKTÄKS',
    description: 'Defines and protects trade secrets and sets remedies against unlawful acquisition, use, and disclosure in competition settings.',
    status: 'in_force',
  },
  {
    id: 'constitution',
    seedFile: '10-constitution.json',
    sourceUrl: 'https://www.riigiteataja.ee/akt/111042025002.xml',
    titleEn: 'Constitution of the Republic of Estonia',
    shortName: 'PS',
    description: 'Foundational constitutional text of Estonia, including rights and principles relevant to privacy, state power, and rule of law.',
    status: 'in_force',
  },
];

function decodeXmlEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\u00a0/g, ' ');
}

function stripMarkup(value: string): string {
  return decodeXmlEntities(value)
    .replace(/<sup\b[^>]*>([\s\S]*?)<\/sup>/gi, '^$1')
    .replace(/<sub\b[^>]*>([\s\S]*?)<\/sub>/gi, '_$1')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
}

function normalizeInline(value: string): string {
  return value
    .replace(/\r/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeLine(value: string): string {
  return normalizeInline(value)
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
}

function normalizeDate(value: string | undefined): string {
  if (!value) return '';
  const date = decodeXmlEntities(value).match(/\d{4}-\d{2}-\d{2}/);
  return date ? date[0] : '';
}

function extractFirst(input: string, regex: RegExp): string {
  const match = input.match(regex);
  return match ? stripMarkup(match[1]) : '';
}

function extractChapterMap(xml: string): Map<string, string> {
  const chapterByParagraphId = new Map<string, string>();
  const chapterRegex = /<peatykk\b[\s\S]*?<\/peatykk>/gi;

  let chapterMatch: RegExpExecArray | null;
  while ((chapterMatch = chapterRegex.exec(xml)) !== null) {
    const chapterXml = chapterMatch[0];
    const chapterNo = normalizeInline(extractFirst(chapterXml, /<peatykkNr\b[^>]*>([\s\S]*?)<\/peatykkNr>/i));
    const chapterTitle = normalizeInline(extractFirst(chapterXml, /<peatykkPealkiri\b[^>]*>([\s\S]*?)<\/peatykkPealkiri>/i));

    let chapterLabel = '';
    if (chapterNo && chapterTitle) chapterLabel = `${chapterNo}. peatükk - ${chapterTitle}`;
    else if (chapterNo) chapterLabel = `${chapterNo}. peatükk`;
    else if (chapterTitle) chapterLabel = chapterTitle;

    if (!chapterLabel) continue;

    const paragraphIdRegex = /<paragrahv\b[^>]*\bid="([^"]+)"[^>]*>/gi;
    let paragraphIdMatch: RegExpExecArray | null;
    while ((paragraphIdMatch = paragraphIdRegex.exec(chapterXml)) !== null) {
      chapterByParagraphId.set(paragraphIdMatch[1], chapterLabel);
    }
  }

  return chapterByParagraphId;
}

function extractParagraphSection(paragraphXml: string): string {
  const display = normalizeInline(extractFirst(paragraphXml, /<kuvatavNr\b[^>]*>([\s\S]*?)<\/kuvatavNr>/i));
  if (display) {
    const cleaned = display
      .replace(/^§\s*/u, '')
      .replace(/\.$/u, '')
      .trim();
    if (cleaned) return cleaned;
  }

  const number = normalizeInline(extractFirst(paragraphXml, /<paragrahvNr\b[^>]*>([\s\S]*?)<\/paragrahvNr>/i));
  return number;
}

function extractParagraphText(paragraphXml: string): string {
  let working = paragraphXml;

  working = working.replace(/<muutmismarge\b[\s\S]*?<\/muutmismarge>/gi, '');
  working = working.replace(/<paragrahvNr\b[\s\S]*?<\/paragrahvNr>/i, '');
  working = working.replace(/<kuvatavNr\b[\s\S]*?<\/kuvatavNr>/i, '');
  working = working.replace(/<paragrahvPealkiri\b[\s\S]*?<\/paragrahvPealkiri>/i, '');

  const lines: string[] = [];
  let currentLine = '';

  const pushCurrentLine = (): void => {
    const normalized = normalizeLine(currentLine);
    if (normalized) lines.push(normalized);
    currentLine = '';
  };

  const tokenRegex = /<(kuvatavNr|tavatekst|HTMLKonteiner)\b[^>]*>([\s\S]*?)<\/\1>|<reavahetus\b[^>]*\/>/gi;
  let tokenMatch: RegExpExecArray | null;

  while ((tokenMatch = tokenRegex.exec(working)) !== null) {
    const tag = tokenMatch[1];

    if (!tag) {
      pushCurrentLine();
      continue;
    }

    const rawValue = tokenMatch[2] ?? '';
    const value = normalizeInline(stripMarkup(rawValue));
    if (!value) continue;

    if (tag.toLowerCase() === 'kuvatavnr') {
      if (value.startsWith('§')) continue;
      pushCurrentLine();
      currentLine = value;
      continue;
    }

    if (currentLine) {
      currentLine += ` ${value}`;
    } else {
      currentLine = value;
    }
  }

  pushCurrentLine();

  const joined = lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return joined;
}

function extractDefinitions(provisions: ParsedProvision[]): ParsedDefinition[] {
  const definitions: ParsedDefinition[] = [];
  const seen = new Set<string>();

  for (const provision of provisions) {
    const titleLower = provision.title.toLowerCase();
    const content = provision.content;

    const likelyDefinitions = /mõiste|mõisted/i.test(titleLower)
      || /käesolevas seaduses kasutatakse/i.test(content)
      || /käesolevas seaduses tähendavad/i.test(content);

    if (!likelyDefinitions) continue;

    const numberedRegex = /(?:^|\n)\s*\d+\)\s*([^\n–—-]{2,160}?)\s*[–—-]\s*([^\n]{4,1600})/g;
    let numberedMatch: RegExpExecArray | null;

    while ((numberedMatch = numberedRegex.exec(content)) !== null) {
      const term = normalizeInline(numberedMatch[1]);
      const definition = normalizeInline(numberedMatch[2]).replace(/[;.]$/u, '').trim();

      if (term.length < 2 || definition.length < 4) continue;

      const key = `${term.toLowerCase()}::${provision.provision_ref}`;
      if (seen.has(key)) continue;
      seen.add(key);

      definitions.push({
        term,
        definition,
        source_provision: provision.provision_ref,
      });
    }

    const quotedRegex = /[„"«]([^"»”]{2,160})["»”]\s+(?:tähendab|on)\s+([^\n.;]{4,1600})/gi;
    let quotedMatch: RegExpExecArray | null;

    while ((quotedMatch = quotedRegex.exec(content)) !== null) {
      const term = normalizeInline(quotedMatch[1]);
      const definition = normalizeInline(quotedMatch[2]);
      if (term.length < 2 || definition.length < 4) continue;

      const key = `${term.toLowerCase()}::${provision.provision_ref}`;
      if (seen.has(key)) continue;
      seen.add(key);

      definitions.push({
        term,
        definition,
        source_provision: provision.provision_ref,
      });
    }
  }

  return definitions;
}

export function parseRiigiTeatajaXml(xml: string, law: TargetLaw): ParsedAct {
  const title = normalizeInline(extractFirst(xml, /<aktinimi\b[\s\S]*?<pealkiri\b[^>]*>([\s\S]*?)<\/pealkiri>/i));

  const shortName = normalizeInline(extractFirst(xml, /<lyhend\b[^>]*>([\s\S]*?)<\/lyhend>/i)) || law.shortName || law.id;

  const issuedDate = normalizeDate(extractFirst(xml, /<vastuvoetud\b[\s\S]*?<aktikuupaev\b[^>]*>([\s\S]*?)<\/aktikuupaev>/i));
  const inForceDate = normalizeDate(extractFirst(xml, /<kehtivuseAlgus\b[^>]*>([\s\S]*?)<\/kehtivuseAlgus>/i));

  const chapterByParagraphId = extractChapterMap(xml);

  const provisions: ParsedProvision[] = [];
  const provisionRefSet = new Set<string>();

  const paragraphRegex = /<paragrahv\b([\s\S]*?)>([\s\S]*?)<\/paragrahv>/gi;
  let paragraphMatch: RegExpExecArray | null;

  while ((paragraphMatch = paragraphRegex.exec(xml)) !== null) {
    const attrs = paragraphMatch[1] ?? '';
    const fullParagraphXml = paragraphMatch[0];

    const paragraphIdMatch = attrs.match(/\bid="([^"]+)"/i);
    const paragraphId = paragraphIdMatch ? paragraphIdMatch[1] : undefined;

    const section = extractParagraphSection(fullParagraphXml);
    if (!section) continue;

    const provisionRef = `para${section.replace(/[^0-9A-Za-z^._-]/g, '')}`;
    if (!provisionRef || provisionRefSet.has(provisionRef)) continue;

    const paragraphTitle = normalizeInline(extractFirst(fullParagraphXml, /<paragrahvPealkiri\b[^>]*>([\s\S]*?)<\/paragrahvPealkiri>/i));
    const titleText = paragraphTitle ? `§ ${section}. ${paragraphTitle}` : `§ ${section}.`;

    const content = extractParagraphText(fullParagraphXml);
    if (!content) continue;

    if (/^kehtetu\b/i.test(content) && content.split(/\s+/).length <= 12) {
      continue;
    }

    provisions.push({
      provision_ref: provisionRef,
      chapter: paragraphId ? chapterByParagraphId.get(paragraphId) : undefined,
      section,
      title: titleText,
      content,
    });

    provisionRefSet.add(provisionRef);
  }

  const definitions = extractDefinitions(provisions);

  return {
    id: law.id,
    type: 'statute',
    title: title || law.id,
    title_en: law.titleEn,
    short_name: shortName,
    status: law.status,
    issued_date: issuedDate,
    in_force_date: inForceDate,
    url: law.sourceUrl,
    description: law.description,
    provisions,
    definitions,
  };
}
