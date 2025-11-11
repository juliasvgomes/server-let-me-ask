/** biome-ignore-all lint/suspicious/noConsole: <explanation> */
/** biome-ignore-all lint/suspicious/noImplicitAnyLet: <explanation> */
/** biome-ignore-all lint/suspicious/noEvolvingTypes: <explanation> */
import { and, eq, sql } from 'drizzle-orm';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod/v4';
import { db } from '../../db/connection.ts';
import { schema } from '../../db/schema/index.ts';
import { generateAnswer, generateEmbeddings } from '../../services/gemini.ts';

export const createQuestionRoute: FastifyPluginCallbackZod = (app) => {
  app.post(
    '/rooms/:roomId/questions',
    {
      schema: {
        params: z.object({
          roomId: z.string(),
        }),
        body: z.object({
          question: z.string().min(1),
        }),
      },
    },
    async (request, reply) => {
      const { roomId } = request.params;
      const { question } = request.body;

      console.log('🟡 Nova pergunta recebida:', question);

      // Gera embeddings da pergunta
      let embeddings;
      try {
        embeddings = await generateEmbeddings(question);
        console.log('🟢 Embeddings gerados com sucesso!');
      } catch (err) {
        console.error('❌ Erro ao gerar embeddings:', err);
        return reply.status(500).send({ error: 'Falha ao gerar embeddings.' });
      }

      const embeddingsAsString = `[${embeddings.join(',')}]`;

      // Busca chunks similares (conteúdo da aula)
      const chunks = await db
        .select({
          id: schema.audioChunks.id,
          transcription: schema.audioChunks.transcription,
          similarity: sql<number>`1 - (${schema.audioChunks.embeddings} <=> ${embeddingsAsString}::vector)`,
        })
        .from(schema.audioChunks)
        .where(
          and(
            eq(schema.audioChunks.roomId, roomId),
            sql`1 - (${schema.audioChunks.embeddings} <=> ${embeddingsAsString}::vector) > 0.7`
          )
        )
        .orderBy(
          sql`${schema.audioChunks.embeddings} <=> ${embeddingsAsString}::vector`
        )
        .limit(3);

      console.log(`🟦 ${chunks.length} chunks similares encontrados.`);

      let context = '';
      if (chunks.length > 0) {
        const transcriptions = chunks.map((chunk) => chunk.transcription);
        context = transcriptions.join('\n\n');
        console.log('🧩 Transcrições enviadas para o Gemini.');
      } else {
        console.log(
          '⚠️ Nenhum chunk similar encontrado. Gerando resposta sem contexto.'
        );
      }

      // Gera resposta
      let answer: string | null = null;
      try {
        answer = await generateAnswer(question, context ? [context] : []);
        console.log('🟢 Resposta gerada com sucesso!');
      } catch (err) {
        console.error('❌ Erro ao gerar resposta:', err);
      }

      // Salva no banco
      const result = await db
        .insert(schema.questions)
        .values({ roomId, questions: question, answer })
        .returning();

      const insertedQuestion = result[0];
      console.log('💾 Pergunta salva no banco:', insertedQuestion);

      if (!insertedQuestion) {
        throw new Error('Falha ao criar nova pergunta.');
      }

      return reply.status(201).send({
        questionId: insertedQuestion.id,
        answer,
      });
    }
  );
};
