import { lessonCapabilities } from '../capabilities/index.ts';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  buildLessonDraftPrompt,
  createLessonDraftProvider,
  generateLessonDraft,
  importLessonDraft,
  LessonDraftGenerationError,
  formatLessonDraftError,
  readLessonDraftProviderConfig,
} from '@learn-anything/lesson-draft-generator';

async function artifact(path: string, data: string) {
  try {
    await writeFile(path, data, { flag: 'wx' });
  } catch (error) {
    if (
      !error ||
      typeof error !== 'object' ||
      !('code' in error) ||
      error.code !== 'EEXIST'
    )
      throw error;
    if ((await readFile(path, 'utf8')) !== data)
      throw new Error('已有不同材料，未覆盖；请选择新的输出目录。');
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      brief: { type: 'string' },
      draft: { type: 'string' },
      output: { type: 'string' },
      generate: { type: 'boolean', default: false },
      'repair-attempts': { type: 'string', default: '0' },
      'json-mode': { type: 'string', default: 'true' },
      'token-limit-field': { type: 'string', default: 'max_completion_tokens' },
      'max-output-tokens': { type: 'string' },
    },
  });
  if (Boolean(values.brief) === Boolean(values.draft))
    throw new Error('请指定 --brief 备课需求，或 --draft 人工材料，二选一。');
  if (values.draft && (values.generate || values['repair-attempts'] !== '0'))
    throw new Error('人工导入不支持模型生成或修复请求。');
  if (values.output && !values.generate && !values.draft)
    throw new Error('预检不保存文件；请显式生成或导入材料。');
  const repairs = Number(values['repair-attempts']);
  if (!Number.isInteger(repairs) || repairs < 0 || repairs > 2)
    throw new Error('修复次数必须为 0–2。');
  if (
    !['true', 'false'].includes(values['json-mode']!) ||
    !['max_completion_tokens', 'max_tokens'].includes(
      values['token-limit-field']!,
    )
  )
    throw new Error('模型兼容选项无效。');
  const maxOutputTokens =
    values['max-output-tokens'] === undefined
      ? undefined
      : Number(values['max-output-tokens']);
  if (
    maxOutputTokens !== undefined &&
    (!Number.isSafeInteger(maxOutputTokens) || maxOutputTokens <= 0)
  )
    throw new Error('输出 token 上限必须为正整数。');
  let result;
  if (values.draft) {
    result = importLessonDraft(
      await readFile(resolve(values.draft), 'utf8'),
      lessonCapabilities,
    );
  } else {
    const { brief } = buildLessonDraftPrompt(
      JSON.parse(await readFile(resolve(values.brief!), 'utf8')),
      lessonCapabilities,
    );
    if (!values.generate) {
      console.log(
        '备课需求有效。仅预检，不调用模型、不读取模型凭证、不写产物；加 --generate 才请求模型。',
      );
      return;
    }
    const provider = createLessonDraftProvider({
      ...readLessonDraftProviderConfig(process.env),
      maxOutputTokens,
      jsonMode: values['json-mode'] === 'true',
      tokenLimitField: values['token-limit-field'] as
        | 'max_completion_tokens'
        | 'max_tokens',
    });
    console.log(
      `开始材料生成，最多 ${repairs + 1} 次模型请求（可能消耗额度）；不自动切换供应商。`,
    );
    result = await generateLessonDraft(brief, {
      capabilities: lessonCapabilities,
      provider,
      maxRepairAttempts: repairs,
    });
  }
  const reportJson = JSON.stringify(result.report, null, 2) + '\n';
  const hash = createHash('sha256')
    .update(result.draftJson)
    .update(reportJson)
    .digest('hex')
    .slice(0, 16);
  const directory = resolve(
    values.output ?? join('outputs/drafts', result.draft.id, hash),
  );
  await mkdir(directory, { recursive: true });
  await artifact(join(directory, 'lesson.draft.json'), result.draftJson);
  await artifact(join(directory, 'generation.json'), reportJson);
  console.log(
    `材料已校验并保存到 ${directory}；知识、教学设计及编译后动作顺序仍需复核。可用 lesson:compile -- --draft <该目录>/lesson.draft.json 预检。`,
  );
}
main().catch((error) => {
  // Even filesystem/argument exceptions can contain secrets. Do not print them.
  console.error(
    error instanceof LessonDraftGenerationError
      ? formatLessonDraftError(error)
      : '材料生成或导入失败；检查需求、协议、模型配置和输出目录。未自动重试、切换供应商或覆盖已有文件。',
  );
  process.exitCode = 1;
});
