/** biome-ignore-all lint/suspicious/noConsole: <explanation> */
/** biome-ignore-all lint/suspicious/noExplicitAny: <explanation> */
import { GoogleGenAI } from '@google/genai';
import { env } from '../env.ts';

const gemini = new GoogleGenAI({
  apiKey: env.GEMINI_API_KEY,
});

const model = 'gemini-2.5-flash';

/**
 * Transcreve áudio (base64) para texto.
 */
export async function transcribeAudio(audioAsBase64: string, mimeType: string) {
  const response = await gemini.models.generateContent({
    model,
    contents: [
      {
        text: 'Transcreva o áudio para português do Brasil. Seja preciso e natural na transcrição. Mantenha a pontuação adequada e divida o texto em parágrafos quando for apropriado.',
      },
      {
        inlineData: {
          mimeType,
          data: audioAsBase64,
        },
      },
    ],
  });

  const output =
    response.candidates?.[0]?.content?.parts
      ?.map((p) => p.text)
      .join(' ')
      .trim() || '';

  if (!output) {
    console.error(
      '❌ transcribeAudio - resposta inválida:',
      JSON.stringify(response, null, 2)
    );
    throw new Error('Não foi possível converter o áudio');
  }

  return output;
}

/**
 * Gera embeddings para um texto (retorna array de numbers).
 */
export async function generateEmbeddings(text: string) {
  const response = await gemini.models.embedContent({
    model: 'text-embedding-004',
    contents: [{ text }],
    config: {
      taskType: 'RETRIEVAL_DOCUMENT',
    },
  });

  if (!response.embeddings?.[0]?.values) {
    console.error(
      '❌ generateEmbeddings - resposta inválida:',
      JSON.stringify(response, null, 2)
    );
    throw new Error('Não foi possível gerar os embeddings.');
  }

  return response.embeddings[0].values;
}

/**
 * Gera resposta a partir de uma pergunta e (opcionalmente) transcrições/contexto.
 * - question: string (obrigatório)
 * - transcriptions: string[] (opcional) — se fornecido e não vazio, será usado como contexto
 *
 * Compatível com chamadas antigas que passam (question, transcriptions).
 */
export async function generateAnswer(
  question: string,
  transcriptions?: string[]
) {
  const context =
    transcriptions && transcriptions.length > 0
      ? transcriptions.join('\n\n')
      : '';

  // Prompt adaptativo: usa contexto se houver, caso contrário responde livremente
  const prompt =
    context && context.trim().length > 0
      ? `
Você é um assistente especialista. Use o contexto abaixo para responder à pergunta de forma clara, precisa e em português do Brasil.

CONTEXTO:
${context}

PERGUNTA:
${question}

INSTRUÇÕES:
- Utilize o contexto acima quando possível;
- Se o contexto não contiver a resposta, responda com base no seu conhecimento;
- Seja didático, direto e mantenha um tom profissional.
`.trim()
      : `
Você é um assistente especialista em tecnologia e programação.
Responda à pergunta abaixo de forma clara, didática e correta em português do Brasil.

PERGUNTA:
${question}

INSTRUÇÕES:
- Seja direto e objetivo;
- Evite respostas vagas como "não há informações suficientes", a não ser que realmente não seja possível responder;
- Se possível, dê um exemplo curto ou analogia.
`.trim();

  // chama o Gemini
  const response = await gemini.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  });

  // tenta extrair o texto da resposta com segurança (vários formatos possíveis)
  let output = '';

  if ((response as any).text) {
    output = (response as any).text;
  } else if ((response as any).output_text) {
    output = (response as any).output_text;
  } else if (response?.candidates?.[0]?.content?.parts) {
    output = response.candidates[0].content.parts
      .map((p) => p.text)
      .filter(Boolean)
      .join(' ')
      .trim();
  }

  console.log('🧠 RAW Gemini response:', JSON.stringify(response, null, 2));
  console.log('✅ Texto extraído da IA:', output);

  if (!output) {
    console.error(
      '❌ generateAnswer - resposta vazia ou inválida:',
      JSON.stringify(response, null, 2)
    );
    throw new Error('Falha ao gerar resposta pelo Gemini — retorno vazio.');
  }

  return output;
}

