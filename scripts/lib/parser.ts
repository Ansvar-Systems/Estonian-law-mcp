/**
 * XML parser for Estonian legislation from Riigi Teataja.
 *
 * Acquisition (issue #56): the historical `/akt/{id}.xml` endpoint is
 * retired upstream — it serves the HTML SPA shell with HTTP 200. Act XML now
 * comes from `/public-api/api/v1/akt/{globaalID}/blob-xml`, which carries the
 * same `<oigusakt>` schema (tyviseadus_1_10.02.2010) this parser has always
 * consumed. See scripts/lib/riigiteataja.ts for endpoint-resolution evidence.
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
  /**
   * Lineage anchor: any known globaalID of the statute. Resolved to the
   * currently valid redaction via the `leiaKehtiv=true` metadata endpoint at
   * ingest time. This is NOT citation identity — `id` is. Never regenerate
   * `id` from URLs or globaalIDs.
   */
  riigiTeatajaId: string;
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

/**
 * Version-identity stamp written into every refreshed seed: which redaction
 * was fetched, from which lineage anchor, when, and through which endpoint.
 */
export interface IngestStamp {
  source: 'riigiteataja';
  /** Lineage anchor globaalID the resolution started from. */
  resolved_from: string;
  /** globaalID of the redaction actually fetched (`kehtivId`). */
  globaal_id: string;
  /** Consolidation-series id (`grupiId` / `terviktekstID`). */
  group_id: number;
  /**
   * Date (UTC) of the retrieval that resolved the current redaction.
   * `leiaKehtiv=true` always resolves to the version current NOW — the
   * metadata endpoint has no date parameter, so the pipeline never performs
   * date-based version selection. This is a retrieval timestamp, not a
   * historical cut.
   */
  resolved_current_as_of: string;
  /** Redaction validity start, as reported by the metadata endpoint. */
  kehtivuse_algus: string | null;
  retrieved_at: string;
  xml_endpoint: string;
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
  _ingest?: IngestStamp;
}

export const TARGET_LAWS: TargetLaw[] = [
  {
    id: 'iks',
    seedFile: '01-personal-data-protection-act.json',
    riigiTeatajaId: '112072025014',
    titleEn: 'Personal Data Protection Act',
    shortName: 'IKS',
    description: 'Estonia\'s core personal data protection statute. It supplements GDPR and sets national rules for supervision, processing grounds, and safeguards.',
    status: 'in_force',
  },
  {
    id: 'cybersecurity-act',
    seedFile: '02-cybersecurity-act.json',
    riigiTeatajaId: '130122025015',
    titleEn: 'Cybersecurity Act',
    shortName: 'KüTS',
    description: 'Framework law for cybersecurity governance and obligations in Estonia, including requirements on network and information system security and supervision.',
    status: 'in_force',
  },
  {
    id: 'electronic-communications-act',
    seedFile: '03-electronic-communications-act.json',
    riigiTeatajaId: '130122025018',
    titleEn: 'Electronic Communications Act',
    shortName: 'ESS',
    description: 'Regulates electronic communications networks and services, including provider obligations, user rights, and supervisory powers.',
    status: 'in_force',
  },
  {
    id: 'info-society-services-act',
    seedFile: '04-information-society-services-act.json',
    riigiTeatajaId: '104072024024',
    titleEn: 'Information Society Services Act',
    shortName: 'InfoTS',
    description: 'Sets legal requirements for information society services, including service provider duties and liability rules in digital services contexts.',
    status: 'in_force',
  },
  {
    id: 'public-information-act',
    seedFile: '05-public-information-act.json',
    riigiTeatajaId: '105072025003',
    titleEn: 'Public Information Act',
    shortName: 'AvTS',
    description: 'Establishes public access to information held by authorities, proactive publication duties, and data management obligations.',
    status: 'in_force',
  },
  {
    id: 'eidas-trust-services-act',
    seedFile: '06-eidas-trust-services-act.json',
    riigiTeatajaId: '130122025016',
    titleEn: 'E-Identification and Trust Services for Electronic Transactions Act',
    shortName: 'EUTS',
    description: 'Implements national rules around e-identification and trust services in alignment with Regulation (EU) No 910/2014 (eIDAS).',
    status: 'in_force',
  },
  {
    id: 'identity-documents-act',
    seedFile: '07-identity-documents-act.json',
    riigiTeatajaId: '126062025006',
    titleEn: 'Identity Documents Act',
    shortName: 'ITDS',
    description: 'Regulates identity documents and related issuance, use, and verification rules, including digital identity credentials.',
    status: 'in_force',
  },
  {
    id: 'penal-code-cyber',
    seedFile: '08-penal-code-cyber.json',
    riigiTeatajaId: '122122025002',
    titleEn: 'Penal Code',
    shortName: 'KarS',
    description: 'Estonia\'s Penal Code, including criminal law provisions relevant to cybercrime, data offences, and unlawful system interference.',
    status: 'in_force',
  },
  {
    id: 'trade-secrets-act',
    seedFile: '09-trade-secrets-act.json',
    riigiTeatajaId: '107122018002',
    titleEn: 'Anti-Unfair Competition and Trade Secrets Protection Act',
    shortName: 'EKTÄKS',
    description: 'Defines and protects trade secrets and sets remedies against unlawful acquisition, use, and disclosure in competition settings.',
    status: 'in_force',
  },
  {
    id: 'constitution',
    seedFile: '10-constitution.json',
    riigiTeatajaId: '111042025002',
    titleEn: 'Constitution of the Republic of Estonia',
    shortName: 'PS',
    description: 'Foundational constitutional text of Estonia, including rights and principles relevant to privacy, state power, and rule of law.',
    status: 'in_force',
  },
];

/**
 * EXACT drop criterion for repeal-marker stub provisions in the §-loop.
 * Markers come both bare ("Kehtetu - RT I ...") and bracketed
 * ("[Kehtetu - RT I, 13.03.2019, 2 - jõust. 15.03.2019]").
 *
 * Single source of truth: the seed migration
 * (scripts/migrations/2026-06-11-pr57-review-remediation.ts) applies this
 * same predicate so the committed corpus cannot drift from the parser.
 */
export function isRepealMarkerStub(content: string): boolean {
  return /^\[?kehtetu\b/i.test(content) && content.split(/\s+/).length <= 12;
}

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

  const tokenRegex = /<(kuvatavNr|kuvatavTekst|tavatekst|HTMLKonteiner)\b[^>]*>([\s\S]*?)<\/\1>|<reavahetus\b[^>]*\/>/gi;
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

function extractFallbackText(xml: string): string {
  const extractFromBlock = (input: string, stripChangeBlocks: boolean): string => {
    let working = stripChangeBlocks
      ? input.replace(/<muutmismarge\b[\s\S]*?<\/muutmismarge>/gi, '')
      : input;
    const lines: string[] = [];
    let currentLine = '';

    const pushCurrentLine = (): void => {
      const normalized = normalizeLine(currentLine);
      if (normalized) lines.push(normalized);
      currentLine = '';
    };

    const tokenRegex = /<(kuvatavNr|kuvatavTekst|tavatekst|HTMLKonteiner)\b[^>]*>([\s\S]*?)<\/\1>|<reavahetus\b[^>]*\/>/gi;
    let tokenMatch: RegExpExecArray | null;

    while ((tokenMatch = tokenRegex.exec(working)) !== null) {
      const tag = tokenMatch[1];
      if (!tag) {
        pushCurrentLine();
        continue;
      }

      const value = normalizeInline(stripMarkup(tokenMatch[2] ?? ''));
      if (!value) continue;

      if (tag.toLowerCase() === 'kuvatavnr') {
        pushCurrentLine();
        currentLine = value;
        continue;
      }

      if (currentLine) currentLine += ` ${value}`;
      else currentLine = value;
    }

    pushCurrentLine();

    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  };

  const sisuMatch = xml.match(/<sisu\b[^>]*>([\s\S]*?)<\/sisu>/i);
  if (sisuMatch) {
    const text = extractFromBlock(sisuMatch[1], true);
    if (text) return text;
  }

  // Some records are published only as repeal/change markers with empty <sisu/>.
  const changeBlocks = [...xml.matchAll(/<muutmismarge\b[\s\S]*?<\/muutmismarge>/gi)]
    .map(match => extractFromBlock(match[0], false))
    .filter(Boolean);
  if (changeBlocks.length > 0) {
    return changeBlocks.join('\n');
  }

  return '';
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

export function parseRiigiTeatajaXml(xml: string, law: TargetLaw, sourceUrl: string): ParsedAct {
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

    if (isRepealMarkerStub(content)) {
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

  if (provisions.length === 0) {
    const fallbackContent = extractFallbackText(xml);
    if (fallbackContent) {
      provisions.push({
        provision_ref: 'para1',
        section: '1',
        title: /<preambul\b/i.test(xml)
          ? 'Preambul'
          : (/<muutmismarge\b/i.test(xml) ? 'Muutmismärge' : '§ 1.'),
        content: fallbackContent,
      });
    }
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
    url: sourceUrl,
    description: law.description,
    provisions,
    definitions,
  };
}
