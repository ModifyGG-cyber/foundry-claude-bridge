/**
 * Handout templates: ready-made layouts for player handouts (telegrams, letters, newspaper
 * clippings, notices). They are served by the relay itself, so they work without Foundry.
 * Claude reads one, writes its own text into the layout, and saves it as a journal page.
 *
 * Foundry keeps inline styles on journal pages but strips <style> and <script>, so every
 * template styles itself inline and uses only fonts that ship with Windows and macOS.
 */

export interface HandoutTemplate {
  id: string;
  name: string;
  /** Which kind of game it suits: '1920s' (Call of Cthulhu), 'fantasy' (D&D, PF2e) or 'any'. */
  setting: '1920s' | 'fantasy' | 'any';
  description: string;
  /** The parts of the sample text to replace. */
  fields: string[];
  html: string;
}

const SERIF = "Georgia, 'Times New Roman', serif";
const TYPEWRITER = "'Courier New', Courier, monospace";
const HAND = "'Segoe Script', 'Bradley Hand', 'Brush Script MT', cursive";
const OLD = "'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif";
const PAPER = 'background:#f3e9d2;background-image:linear-gradient(135deg,rgba(255,255,255,.35),rgba(120,90,40,.12));';
const SHADOW = 'box-shadow:0 2px 8px rgba(0,0,0,.35);';

export const HANDOUT_TEMPLATES: HandoutTemplate[] = [
  {
    id: 'telegram',
    name: 'Telegram',
    setting: '1920s',
    description: 'A telegraph form with a printed header and the message in uppercase typewriter text, sentences ending in STOP.',
    fields: ['office and date line', 'recipient', 'message (uppercase, STOP between sentences)', 'sender'],
    html: `<div style="max-width:560px;margin:1em auto;${PAPER}${SHADOW}border:1px solid #b9a77f;padding:0;color:#2b2418;font-family:${SERIF};">
<div style="background:#c9b27c;padding:10px 18px;border-bottom:3px double #6b5630;display:flex;justify-content:space-between;align-items:baseline;">
<span style="font-size:1.6em;letter-spacing:.3em;font-weight:bold;">TELEGRAM</span>
<span style="font-size:.8em;text-transform:uppercase;letter-spacing:.1em;">Received at New York, N.Y. &middot; Oct 14 1925 &middot; 9.42 AM</span>
</div>
<div style="padding:14px 22px 20px;font-family:${TYPEWRITER};font-size:1.05em;line-height:1.7;text-transform:uppercase;">
<p style="margin:0 0 10px;">TO: DR HENRY ARMITAGE MISKATONIC UNIVERSITY ARKHAM MASS</p>
<p style="margin:0 0 10px;">EXPEDITION DID NOT RETURN STOP FOUND CAMP EMPTY AND TENTS SLASHED FROM WITHIN STOP DO NOT SEND THE OTHERS STOP</p>
<p style="margin:0;text-align:right;">= ELIAS =</p>
</div>
</div>`,
  },
  {
    id: 'newspaper-clipping',
    name: 'Newspaper clipping',
    setting: '1920s',
    description: 'A torn-out newspaper column with masthead, date, headline, subhead and two short columns of body text.',
    fields: ['paper name', 'date and price line', 'headline', 'subhead', 'article text'],
    html: `<div style="max-width:620px;margin:1em auto;background:#eee6d0;${SHADOW}padding:16px 22px;color:#1f1b14;font-family:${SERIF};transform:rotate(-.6deg);border:1px solid #cfc3a3;">
<div style="text-align:center;border-bottom:2px solid #1f1b14;padding-bottom:4px;">
<div style="font-family:${OLD};font-size:2.1em;font-weight:bold;letter-spacing:.04em;">The Arkham Advertiser</div>
<div style="font-size:.75em;display:flex;justify-content:space-between;border-top:1px solid #1f1b14;margin-top:4px;padding-top:2px;"><span>VOL. LXII &mdash; No. 211</span><span>THURSDAY, MARCH 18, 1926</span><span>TWO CENTS</span></div>
</div>
<h2 style="font-size:1.7em;line-height:1.1;text-align:center;margin:10px 0 2px;text-transform:uppercase;">Strange Lights Seen Over Meadow Hill</h2>
<div style="text-align:center;font-style:italic;margin-bottom:8px;">Farmers Report Livestock Missing; Sheriff Calls It &ldquo;Mischief&rdquo;</div>
<div style="column-count:2;column-gap:18px;text-align:justify;font-size:.92em;line-height:1.45;">
<p style="margin:0 0 6px;">Residents along the Aylesbury Pike were roused from their beds late Tuesday night by what several described as a column of pale violet light rising from the woods above Meadow Hill.</p>
<p style="margin:0 0 6px;">Mr. Silas Whateley, whose farm adjoins the hill, reports that four of his sheep were gone by morning, the gate still latched. &ldquo;There was no sound,&rdquo; he told this paper. &ldquo;Not a bleat.&rdquo;</p>
<p style="margin:0;">Sheriff Engle has dismissed the matter as the work of local youths, but declined to say why two deputies remain posted on the hill road.</p>
</div>
</div>`,
  },
  {
    id: 'handwritten-letter',
    name: 'Handwritten letter',
    setting: 'any',
    description: 'A personal letter in a handwriting font on cream paper, with place and date, greeting, body, sign-off and an optional postscript.',
    fields: ['place and date', 'greeting', 'body paragraphs', 'sign-off and name', 'postscript'],
    html: `<div style="max-width:560px;margin:1em auto;${PAPER}${SHADOW}padding:28px 34px;color:#1d2a44;font-family:${HAND};font-size:1.15em;line-height:1.75;">
<p style="text-align:right;margin:0 0 14px;">Kingsport, the 3rd of June</p>
<p style="margin:0 0 10px;">My dearest Margaret,</p>
<p style="margin:0 0 10px;">I write in haste, for the house is not as Uncle left it. Someone has been in his study &mdash; the books are back on the shelves, but every one of them is upside down.</p>
<p style="margin:0 0 10px;">Please come as soon as you are able, and tell no one where you are going.</p>
<p style="margin:16px 0 0 50%;">Ever yours,<br>Thomas</p>
<p style="margin:18px 0 0;font-size:.9em;">P.S. Bring the key I gave you at Christmas. Do not open the box.</p>
</div>`,
  },
  {
    id: 'diary-page',
    name: 'Diary page',
    setting: 'any',
    description: 'A ruled diary page with a dated entry in faded handwriting, where the last lines can trail off or turn frantic.',
    fields: ['date heading', 'entry text', 'final hurried lines'],
    html: `<div style="max-width:520px;margin:1em auto;background:#f6f0dd;background-image:repeating-linear-gradient(transparent,transparent 31px,#c8d3e0 31px,#c8d3e0 32px);${SHADOW}padding:20px 28px 24px 56px;border-left:2px solid #d9a0a0;color:#3a3326;font-family:${HAND};font-size:1.1em;line-height:32px;">
<div style="font-weight:bold;">April 9th</div>
<div>The scratching in the walls has stopped. I tell myself this is a good thing.</div>
<div>Mrs. Corey says the rats left the village a week ago, all at once, as if called.</div>
<div style="transform:rotate(-1.5deg);font-size:1.15em;color:#5a1d1d;">It is not rats. It was never rats. It is UNDER the house &mdash;</div>
</div>`,
  },
  {
    id: 'police-report',
    name: 'Police report',
    setting: '1920s',
    description: 'A typed police incident report with department header, case number, a table of particulars and an officer\'s narrative.',
    fields: ['department', 'case number and date', 'particulars (location, victim, reporting party)', 'narrative', 'officer and badge'],
    html: `<div style="max-width:600px;margin:1em auto;background:#f4f1e8;${SHADOW}border:1px solid #9a9381;padding:18px 24px;color:#1b1b1b;font-family:${TYPEWRITER};font-size:.95em;line-height:1.5;">
<div style="text-align:center;font-family:${SERIF};font-weight:bold;letter-spacing:.12em;">ARKHAM POLICE DEPARTMENT</div>
<div style="text-align:center;font-size:.85em;margin-bottom:10px;">INCIDENT REPORT &mdash; FOR DEPARTMENT USE ONLY</div>
<table style="width:100%;border-collapse:collapse;font-size:.95em;margin-bottom:10px;">
<tr><td style="border:1px solid #777;padding:3px 6px;width:34%;">CASE NO.</td><td style="border:1px solid #777;padding:3px 6px;">26-0417</td></tr>
<tr><td style="border:1px solid #777;padding:3px 6px;">DATE / TIME</td><td style="border:1px solid #777;padding:3px 6px;">Nov. 2, 1926 &mdash; 3:15 A.M.</td></tr>
<tr><td style="border:1px solid #777;padding:3px 6px;">LOCATION</td><td style="border:1px solid #777;padding:3px 6px;">Rear of 12 Garrison St.</td></tr>
<tr><td style="border:1px solid #777;padding:3px 6px;">VICTIM</td><td style="border:1px solid #777;padding:3px 6px;">Unknown male, approx. 40 yrs.</td></tr>
<tr><td style="border:1px solid #777;padding:3px 6px;">REPORTED BY</td><td style="border:1px solid #777;padding:3px 6px;">Night watchman, B. Kowalski</td></tr>
</table>
<div style="font-weight:bold;">NARRATIVE:</div>
<p style="margin:2px 0 12px;">Responding officer found the deceased seated against the wall, eyes open. No wounds evident. Coroner notes the body was cold despite death being reported less than one hour prior. Subject's hands were clenched around a carved stone, since removed to evidence.</p>
<div style="display:flex;justify-content:space-between;font-size:.9em;"><span>Officer: Sgt. R. Dolan</span><span>Badge No. 117</span></div>
</div>`,
  },
  {
    id: 'occult-tome-page',
    name: 'Occult tome page',
    setting: 'any',
    description: 'A page torn from an old book of forbidden lore: chapter heading, dense archaic text, a drawn sigil, and a reader\'s marginal note.',
    fields: ['book title or chapter heading', 'passage text', 'sigil or symbol', 'marginal note'],
    html: `<div style="max-width:560px;margin:1em auto;background:#e8dcbf;background-image:radial-gradient(ellipse at center,rgba(255,255,255,.2),rgba(90,60,20,.3));${SHADOW}padding:26px 30px;color:#2a1d10;font-family:${OLD};line-height:1.55;position:relative;">
<div style="text-align:center;font-size:.8em;letter-spacing:.3em;text-transform:uppercase;">Liber Tenebrarum &middot; Caput VII</div>
<div style="text-align:center;font-size:1.4em;font-variant:small-caps;margin:6px 0 12px;">Of the Opening of the Way</div>
<p style="margin:0 0 10px;text-align:justify;"><span style="float:left;font-size:3.2em;line-height:.9;margin:4px 6px 0 0;color:#6b1414;">W</span>hen the starres stand in their right places, and the thinne place betwixt the worlds is worn as cloth upon the elbow, then may He that Waiteth be called up, though the caller shall not be the same who sendeth Him back.</p>
<div style="text-align:center;font-size:2.2em;color:#6b1414;margin:6px 0;">&#9737; &#10022; &#9737;</div>
<p style="margin:0;text-align:justify;">Lette none speake the seconde name aloud, for it is heard.</p>
<div style="margin-top:12px;font-family:${HAND};font-size:.95em;color:#24396b;transform:rotate(-2deg);">&mdash; this is the rite Carver used. He was wrong about the stars. &mdash; W.</div>
</div>`,
  },
  {
    id: 'calling-card',
    name: 'Calling card',
    setting: '1920s',
    description: 'A small engraved calling or business card with a name, title and address, and room for a handwritten note on the back.',
    fields: ['name', 'title or trade', 'address', 'handwritten note'],
    html: `<div style="max-width:360px;margin:1em auto;background:#fbf8f0;${SHADOW}border:1px solid #d8d0bd;padding:22px 24px;text-align:center;color:#222;font-family:${SERIF};">
<div style="font-size:1.35em;font-variant:small-caps;letter-spacing:.08em;">Dr. Ambrose Kettering</div>
<div style="font-size:.85em;font-style:italic;margin:2px 0 10px;">Antiquarian &amp; Dealer in Rare Books</div>
<div style="font-size:.75em;letter-spacing:.05em;">41 Water Street &middot; Innsmouth, Mass.</div>
<div style="border-top:1px dashed #bbb;margin-top:14px;padding-top:8px;font-family:${HAND};color:#1d2a44;font-size:.95em;">Ask for the blue ledger. Come after dark.</div>
</div>`,
  },
  {
    id: 'ticket',
    name: 'Travel ticket',
    setting: '1920s',
    description: 'A steamship or railway ticket with a tear-off stub: line name, route, date, class and passenger.',
    fields: ['line name', 'from and to', 'date and departure', 'class and berth', 'passenger name', 'serial number'],
    html: `<div style="max-width:600px;margin:1em auto;display:flex;${SHADOW}font-family:${SERIF};color:#2a2014;">
<div style="flex:1;background:#e9d9a8;padding:14px 18px;border:1px solid #a88f52;border-right:2px dashed #7a6535;">
<div style="font-weight:bold;letter-spacing:.2em;font-size:1.05em;">TRANS-ATLANTIC STEAMSHIP LINE</div>
<div style="font-size:1.5em;margin:6px 0;">BOSTON &rarr; LIVERPOOL</div>
<div style="font-size:.85em;line-height:1.6;">S.S. <i>Carpathian Star</i> &middot; Sails Sept. 6, 1927, 11 A.M., Pier 4<br>Second Class &middot; Berth 22-B<br>Passenger: <b>Mr. J. Abernathy</b></div>
</div>
<div style="width:120px;background:#e2cf98;padding:14px 10px;border:1px solid #a88f52;border-left:none;text-align:center;font-size:.75em;">
<div style="font-weight:bold;letter-spacing:.15em;">STUB</div>
<div style="margin:8px 0;">Berth 22-B</div>
<div style="font-family:${TYPEWRITER};font-size:1.2em;">No 04417</div>
</div>
</div>`,
  },
  {
    id: 'asylum-record',
    name: 'Asylum admission record',
    setting: '1920s',
    description: 'A sanitarium patient admission form: institution header, patient details, diagnosis, the physician\'s notes, and an urgent handwritten addendum.',
    fields: ['institution', 'patient details', 'diagnosis', 'physician notes', 'handwritten addendum'],
    html: `<div style="max-width:600px;margin:1em auto;background:#f2f0ea;${SHADOW}border:1px solid #a7a291;padding:18px 24px;color:#1e1e1e;font-family:${SERIF};font-size:.95em;line-height:1.5;">
<div style="text-align:center;font-weight:bold;letter-spacing:.15em;">ARKHAM SANITARIUM</div>
<div style="text-align:center;font-size:.8em;margin-bottom:10px;">RECORD OF ADMISSION</div>
<div style="font-family:${TYPEWRITER};font-size:.95em;">
<div>Patient: Martha Bellweather &nbsp;&nbsp; Age: 34 &nbsp;&nbsp; No. 1182</div>
<div>Admitted: 14 Jan 1928 &nbsp;&nbsp; Committed by: Husband</div>
<div>Diagnosis: Acute melancholia with persistent delusion</div>
</div>
<div style="font-weight:bold;margin-top:10px;">Physician's notes:</div>
<p style="margin:2px 0 10px;font-family:${TYPEWRITER};font-size:.95em;">Patient insists her reflection no longer matches her movements. Calm when mirrors are covered. Draws the same spiral figure compulsively. Sedated nightly.</p>
<div style="font-family:${HAND};color:#7a1b1b;transform:rotate(-1deg);">Feb 2 &mdash; Mirror in Room 9 found cracked FROM BEHIND. Move her. &mdash; Dr. H.</div>
</div>`,
  },
  {
    id: 'wanted-poster',
    name: 'Wanted poster',
    setting: 'fantasy',
    description: 'A bold WANTED notice with the culprit\'s name, a framed space for a sketch or description, the crime and the reward.',
    fields: ['name or alias', 'description (or a portrait image)', 'crimes', 'reward', 'issuing authority'],
    html: `<div style="max-width:440px;margin:1em auto;background:#e3cfa0;background-image:radial-gradient(ellipse at center,rgba(255,255,255,.25),rgba(110,70,20,.35));${SHADOW}border:2px solid #6e4f22;padding:18px 22px;text-align:center;color:#2b1a08;font-family:${OLD};">
<div style="font-size:3em;font-weight:bold;letter-spacing:.12em;line-height:1;">WANTED</div>
<div style="font-size:1.1em;letter-spacing:.3em;margin-bottom:10px;">DEAD OR ALIVE</div>
<div style="border:3px double #6e4f22;padding:22px 10px;margin:0 auto 10px;width:70%;font-style:italic;font-size:.95em;">Half-elf, tall, scar across the left brow,<br>wears a crow-feather cloak</div>
<div style="font-size:1.8em;font-weight:bold;text-transform:uppercase;">&ldquo;Vessa the Crow&rdquo;</div>
<div style="font-size:.95em;margin:6px 0;">For highway robbery, arson of the Millbrook granary,<br>and the murder of two of the Duke's wardens</div>
<div style="font-size:1.4em;font-weight:bold;margin-top:8px;">REWARD: 500 GOLD CROWNS</div>
<div style="font-size:.8em;margin-top:8px;">By order of the Watch-Captain of Greywater</div>
</div>`,
  },
  {
    id: 'royal-decree',
    name: 'Royal decree',
    setting: 'fantasy',
    description: 'A formal proclamation on a scroll: ruler\'s titles, the decree in high formal language, date, and a wax seal.',
    fields: ['ruler and titles', 'decree text', 'date in the realm\'s calendar', 'seal emblem'],
    html: `<div style="max-width:540px;margin:1em auto;background:#efe2c0;${SHADOW}border-top:14px solid #c9b07a;border-bottom:14px solid #c9b07a;border-radius:4px;padding:22px 30px;color:#2d1e0e;font-family:${OLD};line-height:1.6;text-align:center;">
<div style="font-size:.85em;letter-spacing:.25em;text-transform:uppercase;">Hear Ye, Hear Ye</div>
<div style="font-size:1.3em;font-variant:small-caps;margin:6px 0 12px;">By Command of Her Majesty Aldreth the Second,<br>Queen of the Three Rivers, Warden of the Western March</div>
<p style="text-align:justify;margin:0 0 10px;">Be it known that from this day the eastern road beyond the Thornwall is closed to all travellers, merchants and pilgrims alike, upon pain of forfeiture. Any who have entered the Hollow Wood since the last new moon shall present themselves to the Crown's wardens to be examined.</p>
<div style="font-style:italic;font-size:.9em;">Given at Highcrest, the ninth day of Harvestwane, in the 312th year of the Realm</div>
<div style="width:64px;height:64px;margin:12px auto 0;border-radius:50%;background:radial-gradient(circle at 35% 35%,#c0392b,#7b1612);color:#f3d9b0;font-size:1.8em;line-height:64px;box-shadow:0 2px 4px rgba(0,0,0,.4);">&#9819;</div>
</div>`,
  },
  {
    id: 'notice-board',
    name: 'Notice board posting',
    setting: 'fantasy',
    description: 'A job or bounty notice pinned to a tavern or guild board: a heading, what is wanted, pay, and where to ask.',
    fields: ['heading', 'the job', 'payment', 'contact or where to ask'],
    html: `<div style="max-width:420px;margin:1em auto;background:#f1e6c8;${SHADOW}padding:18px 20px 16px;color:#2c2213;font-family:${SERIF};transform:rotate(1deg);position:relative;border:1px solid #cbb889;">
<div style="position:absolute;top:-8px;left:50%;width:14px;height:14px;margin-left:-7px;border-radius:50%;background:#8a2a1c;box-shadow:0 1px 2px rgba(0,0,0,.5);"></div>
<div style="font-size:1.5em;font-weight:bold;text-align:center;text-transform:uppercase;letter-spacing:.06em;">Help Wanted</div>
<div style="text-align:center;font-style:italic;margin-bottom:8px;">Strong arms &amp; stout hearts</div>
<p style="margin:0 0 8px;">Something has been taking chickens &mdash; and now a goat &mdash; from the farms along Willow Creek. Tracks too big for any fox. Seeking able folk to find the beast and end it.</p>
<p style="margin:0 0 8px;"><b>Pay:</b> 40 silver, and supper at the Bent Nail for a week.</p>
<p style="margin:0;font-size:.9em;">Ask for Old Hobb at the mill. Bring your own torches.</p>
</div>`,
  },
];

export interface HandoutTemplateSummary {
  id: string;
  name: string;
  setting: HandoutTemplate['setting'];
  description: string;
  fields: string[];
}

export function listHandoutTemplates(setting?: string): HandoutTemplateSummary[] {
  return HANDOUT_TEMPLATES.filter(t => !setting || t.setting === setting || t.setting === 'any').map(
    ({ id, name, setting: s, description, fields }) => ({ id, name, setting: s, description, fields }),
  );
}

export function getHandoutTemplate(id: string) {
  const template = HANDOUT_TEMPLATES.find(t => t.id === id);
  if (!template) {
    throw new Error(`Unknown handout template "${id}". Templates: ${HANDOUT_TEMPLATES.map(t => t.id).join(', ')}`);
  }
  return {
    ...template,
    usage:
      'Keep the layout and inline styles, and replace the sample text with your own (fields lists what to change). ' +
      'Save it with create-journal (content) or create-journal-page (type text), then show it to players with show-journal. ' +
      'Add or remove paragraphs and table rows as needed. Use inline styles only: <style> and <script> are stripped.',
  };
}
