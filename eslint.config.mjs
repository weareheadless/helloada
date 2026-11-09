import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTypeScript from 'eslint-config-next/typescript'

export default [
  ...nextVitals,
  ...nextTypeScript,
  {
    ignores: ['.next/**', '.open-next/**', 'node_modules/**', 'payload-types.ts'],
  },
  {
    // The owner workspace is a verbatim port of the tenant admin surface while
    // the control plane takes ownership of it. Its existing React Compiler
    // findings stay visible as warnings until the tenant copy is deleted.
    files: ['src/workspace/**/*.{ts,tsx}'],
    rules: {
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/static-components': 'warn',
    },
  },
]
