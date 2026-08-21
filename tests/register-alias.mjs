/**
 * テスト実行時に `@/xxx` を解決するためのフック。
 *
 * Node は tsconfig の paths を読まないので、`@/` を実ファイルに対応づける。
 * これがあるおかげでテストのために本体のimport文を書き換えずに済む。
 * 新しいライブラリは何も入れていない（Node 24 の組み込み機能のみ）。
 */
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      return {
        url: pathToFileURL(path.join(root, `${specifier.slice(2)}.ts`)).href,
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});
