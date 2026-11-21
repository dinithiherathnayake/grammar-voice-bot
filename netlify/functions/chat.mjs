// Netlify Function: POST /chat  ->  Gemini (free API)
// The key is read from the GEMINI_API_KEY environment variable set in the Netlify dashboard.

// Main model, plus a backup that is used automatically if the main one is not found (404).
const MODELS = [...new Set([process.env.GEMINI_MODEL || "gemini-3.5-flash-lite", "gemini-3.8-flash"])];

const LEVELS = {
  beginner: "Use very simple words and short sentences (A1-A2). Explain mistakes in very simple English.",
  intermediate: "Use clear everyday English (B1-B2). Explain mistakes briefly.",
  advanced: "Use natural, rich English (C1). Mention subtle word choice or style when useful.",
};

const TOPICS = {
  daily: "daily life (routine, family, hobbies, weather)",
  meeting: "meeting new people (introductions, small talk)",
  friends: "making plans with a friend (weekend, hobbies, invitations)",
  shopping: "shopping in a store (you are the shop assistant)",
  restaurant: "ordering food at a restaurant (you are the waiter)",
  travel: "travel (airports, hotels, trips)",
  health: "visiting a doctor (you are the doctor, keep it light and general)",
  directions: "asking for and giving directions in a city",
  uni_classes: "university classes, lectures, and favorite subjects (you are a classmate)",
  uni_campus: "casual chat with a classmate about campus life, cafeteria, schedules, and free time",
  uni_professor: "office hours with a professor (you are the professor; the learner asks for help, an extension, or clarification)",
  uni_study: "assignments, deadlines, exams, and study habits (you are a classmate)",
  uni_group: "working on a group project: dividing tasks, giving opinions, setting deadlines",
  uni_admin: "university office or academic advisor: courses, registration, documents, schedules (you are the staff member)",
  uni_housing: "roommates and student housing: chores, rules, living costs (you are the roommate)",
  uni_career: "student clubs, internships, volunteering, and future plans (you are a friendly student)",
  job_interview: "a job interview (you are the interviewer, ask one question at a time)",
  job_colleagues: "small talk with a colleague at the workplace",
  job_meeting: "a team meeting: updates, problems, opinions, deadlines (you are the team leader)",
  job_boss: "talking with a manager: feedback, workload, asking for a day off or a raise (you are the manager)",
  job_customer: "customer service (you are an unhappy but polite customer; the learner is the service agent)",
  job_presentation: "giving a work presentation: introducing a topic, explaining points, answering questions (you are an audience member)",
  job_networking: "networking at a professional event: introducing yourself and your job (you are another attendee)",
  job_it: "an IT or software team: daily stand-up, bugs, code review, project updates (you are a teammate)",
  job_health: "working in a clinic or hospital front desk or nursing support: greeting patients, forms, appointments (you are a patient or colleague; give no medical advice)",
  job_hotel: "hotel and tourism work: check-in, requests, recommendations (you are a hotel guest; the learner is the hotel staff)",
};

function systemPrompt(level, topic) {
  return `You are a friendly English conversation partner and grammar checker.
Conversation topic / role-play scene: ${TOPICS[topic] || TOPICS.daily}.
Stay in the role described and speak to the learner as the other person in that scene.
${LEVELS[level] || LEVELS.beginner}

The learner's message came from voice or typing. Ignore missing capital letters and punctuation. Only report real grammar, word choice, or spelling mistakes.

For the learner's LAST message, return JSON with:
- hasMistakes: true or false
- corrected: the full corrected sentence (if no mistakes, repeat their sentence)
- explanation: if mistakes, a short simple reason (max 25 words); if none, a very short praise (max 8 words)
- reply: a natural reply that continues the conversation and ends with ONE short question (max 40 words). Do not put corrections in the reply.`;
}

const SCHEMA = {
  type: "OBJECT",
  properties: {
    hasMistakes: { type: "BOOLEAN" },
    corrected: { type: "STRING" },
    explanation: { type: "STRING" },
    reply: { type: "STRING" },
  },
  required: ["hasMistakes", "corrected", "explanation", "reply"],
};

function parseModelJson(text) {
  try {
    return JSON.parse(text);
  } catch (_) {
    const cleaned = text.replace(/```json|```/g, "").trim();
    try { return JSON.parse(cleaned); } catch (_) { return null; }
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) {
    return json({ error: "Server is missing GEMINI_API_KEY. Add it in Netlify > Site configuration > Environment variables, then redeploy." }, 500);
  }

  try {
    let payload;
    try { payload = await req.json(); } catch (_) { return json({ error: "Bad request." }, 400); }
    const { messages, level, topic } = payload || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return json({ error: "No messages sent." }, 400);
    }

    const contents = messages.slice(-12).map((m) => ({
      role: m.role === "bot" ? "model" : "user",
      parts: [{ text: String(m.text || "").slice(0, 1000) }],
    }));

    const init = {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt(level, topic) }] },
        contents,
        generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMA },
      }),
    };
    let response;
    for (const model of MODELS) {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, init);
      if (response.status !== 404) break;
    }

    if (response.status === 429) {
      return json({ error: "Free limit reached. Please wait a minute or try again tomorrow." }, 429);
    }
    if (response.status === 400 || response.status === 403) {
      console.error("Gemini error:", response.status, await response.text());
      return json({ error: "The API key or model was rejected. Check GEMINI_API_KEY in Netlify." }, 502);
    }
    if (!response.ok) {
      console.error("Gemini error:", response.status, await response.text());
      return json({ error: "The AI service had a problem. Please try again." }, 502);
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
    const parsed = parseModelJson(text);

    if (!parsed || typeof parsed.reply !== "string") {
      return json({
        hasMistakes: false,
        corrected: "",
        explanation: "",
        reply: text || "Sorry, I could not answer that. Please try again.",
      });
    }

    return json({
      hasMistakes: !!parsed.hasMistakes,
      corrected: String(parsed.corrected || ""),
      explanation: String(parsed.explanation || ""),
      reply: parsed.reply,
    });
  } catch (err) {
    console.error(err);
    return json({ error: "Server error. Please try again." }, 500);
  }
};

// Makes the function answer at /chat
export const config = { path: "/chat" };
