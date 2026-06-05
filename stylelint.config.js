/** @type {import('stylelint').Config} */
export default {
  extends: ['stylelint-config-standard'],
  rules: {
    // The brand system uses many single-purpose custom properties that read
    // fine without an enforced blank line between them.
    'custom-property-empty-line-before': null,

    // The codebase uses BEM naming (block__element--modifier). Keep kebab-case
    // *within* each BEM segment but allow the `__` / `--` separators.
    'selector-class-pattern': [
      '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:__[a-z0-9]+(?:-[a-z0-9]+)*)*(?:--[a-z0-9]+(?:-[a-z0-9]+)*)*$',
      { message: 'Expected class selector to be kebab-case BEM (block__element--modifier)' },
    ],

    // @keyframes are named in camelCase here (e.g. orbitSwingA).
    'keyframes-name-pattern': null,

    // -webkit-mask-image is intentional — Safari still needs the prefix for masks.
    'property-no-vendor-prefix': null,

    // These flag pre-existing stylistic organization in the brand CSS rather than
    // defects; leave the existing structure as authored.
    'no-descending-specificity': null,
    'no-duplicate-selectors': null,
  },
};
