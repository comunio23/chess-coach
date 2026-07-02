// Edge Function "ocr-partie" — liest handschriftliche Schach-Partieformulare
// aus und speichert das Ergebnis automatisch in der Tabelle "partien".
// Zweistufig: Mistral OCR liest den Rohtext, OpenAI wertet ihn strukturiert aus.
// Deploy: mcp__supabase__deploy_edge_function (verify_jwt = false, da eigene
// duale Auth-Pruefung unten).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Gleiche Kandidatenliste wie die DMS-OCR-Function, damit ein bereits
// vorhandener Mistral-Key (z.B. MISTRA_OCR_KEY) mitgenutzt werden kann.
// Hinweis: Dieser Key ist nur fuer den Mistral-OCR-Endpunkt (/v1/ocr) freigeschaltet,
// NICHT fuer Chat-Completions/Pixtral (401) -- daher zweistufig: Mistral OCR liest
// den Rohtext, OpenAI (bereits im Projekt fuer den Bot vorhanden) wertet ihn strukturiert aus.
const MISTRAL_KEY_CANDIDATES = ["MISTRA_OCR_KEY", "MICTRAL_OCR_KEY", "MISTRAL_OCR_KEY", "MISTRAL_API_KEY", "MISTRAL_KEY"];
const MISTRAL_KEY = MISTRAL_KEY_CANDIDATES.map((k) => Deno.env.get(k)).find((v) => !!v)!;
const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY")!;
const INTERNAL_TOKEN = Deno.env.get("PARTIEN_INTERNAL_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `Du bekommst den OCR-Rohtext eines handschriftlich ausgefuellten Schach-Partieformulars (Turnierformular, Zugliste in algebraischer Notation, oft zweispaltig Weiss/Schwarz). Der Text kann OCR-Fehler enthalten.

Gib AUSSCHLIESSLICH ein JSON-Objekt zurueck, keine Erklaerungen, kein Markdown, exakt dieses Schema:
{
  "datum": "YYYY-MM-DD oder null",
  "veranstaltung": "string oder null",
  "brett": "Zahl oder null",
  "verein_weiss": "string oder null",
  "verein_schwarz": "string oder null",
  "spieler_weiss": "string oder null",
  "spieler_schwarz": "string oder null",
  "elo_weiss": "Zahl oder null",
  "elo_schwarz": "Zahl oder null",
  "ergebnis": "eines von 1-0 | 0-1 | 1/2-1/2 | * oder null",
  "zuege": [{"nr": 1, "weiss": "e4", "schwarz": "e5"}, ...],
  "unsichere_felder": ["liste der Feldnamen, bei denen du dir unsicher bist"]
}

Regeln:
- Erfinde NIEMALS Zuege oder Daten, die nicht klar erkennbar sind.
- Bei Unsicherheit: Feld auf null setzen und den Feldnamen in unsichere_felder aufnehmen.
- Zuege in Standard-algebraischer Notation (SAN), z.B. Nf3, O-O, exd5, Lxe5+.
- Wenn eine Zugnummer nur einen Halbzug hat (Partie endet nach Weiss-Zug): schwarz = null.
- Ist ein Halbzug unleserlich, setze ihn auf null und nimm "zuege" mit der jeweiligen Zugnummer in unsichere_felder auf (z.B. "zug_14_schwarz").`;

async function mistralOcrText(base64: string, mimeType: string): Promise<string> {
  const isImage = mimeType.startsWith("image/");
  const docField = isImage
    ? { type: "image_url", image_url: `data:${mimeType};base64,${base64}` }
    : { type: "document_url", document_url: `data:${mimeType};base64,${base64}` };

  const res = await fetch("https://api.mistral.ai/v1/ocr", {
    method: "POST",
    headers: { "Authorization": `Bearer ${MISTRAL_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "mistral-ocr-latest", document: docField }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Mistral-OCR-Fehler ${res.status}: ${errText}`);
  }
  const data = await res.json();
  return ((data.pages || []) as Array<{ markdown?: string }>).map((p) => p.markdown || "").join("\n\n").trim();
}

async function extractPartieJson(ocrText: string): Promise<any> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-5.4-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `OCR-Rohtext des Partieformulars:\n\n${ocrText}\n\nGib das JSON gemaess Schema zurueck.` },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI-API-Fehler ${res.status}: ${errText}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI lieferte keine Antwort");
  return JSON.parse(content);
}

function buildPgn(zuege: { nr: number; weiss: string | null; schwarz: string | null }[]): string {
  return zuege.map(z => `${z.nr}.${z.weiss ? " " + z.weiss : ""}${z.schwarz ? " " + z.schwarz : ""}`).join(" ").trim();
}

async function checkAuth(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return false;

  // Server-zu-Server (Telegram-Bot): eigenes Shared-Secret
  if (token === INTERNAL_TOKEN) return true;

  // Web-Frontend: gueltiges Supabase-User-JWT
  const { data, error } = await supabase.auth.getUser(token);
  return !error && !!data.user;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (!(await checkAuth(req))) {
    return new Response(JSON.stringify({ error: "Nicht autorisiert" }), {
      status: 401,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { base64, mimeType, filename, quelle } = body;
    if (!base64 || !mimeType) {
      return new Response(JSON.stringify({ error: "base64 und mimeType erforderlich" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const ocrText = await mistralOcrText(base64, mimeType);
    const rawJson = await extractPartieJson(ocrText);
    const zuege = Array.isArray(rawJson.zuege) ? rawJson.zuege : [];
    const pgn = buildPgn(zuege);

    // Foto in Storage hochladen
    const ext = (mimeType.split("/")[1] || "jpg").replace("jpeg", "jpg");
    const path = `${crypto.randomUUID()}.${ext}`;
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const { error: uploadError } = await supabase.storage
      .from("partieformulare")
      .upload(path, bytes, { contentType: mimeType });
    if (uploadError) throw new Error(`Storage-Upload fehlgeschlagen: ${uploadError.message}`);

    const insertRow = {
      datum: rawJson.datum || null,
      veranstaltung: rawJson.veranstaltung || "",
      brett: rawJson.brett ?? null,
      verein_weiss: rawJson.verein_weiss || "",
      verein_schwarz: rawJson.verein_schwarz || "",
      spieler_weiss: rawJson.spieler_weiss || "",
      spieler_schwarz: rawJson.spieler_schwarz || "",
      elo_weiss: rawJson.elo_weiss ?? null,
      elo_schwarz: rawJson.elo_schwarz ?? null,
      ergebnis: rawJson.ergebnis || "",
      zuege,
      pgn,
      ocr_status: "auto",
      ocr_rohantwort: rawJson,
      formular_foto_pfad: path,
      quelle: quelle || "foto",
    };

    const { data: partie, error: insertError } = await supabase
      .from("partien")
      .insert(insertRow)
      .select()
      .single();
    if (insertError) throw new Error(`DB-Insert fehlgeschlagen: ${insertError.message}`);

    return new Response(
      JSON.stringify({ partie, unsichere_felder: rawJson.unsichere_felder || [] }),
      { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
