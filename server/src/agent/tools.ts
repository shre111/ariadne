import type Anthropic from '@anthropic-ai/sdk';

// Tool definitions for the Anthropic API.
// Every new tool must also be classified in policy.ts in the same commit (invariant #4).

export const AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'navigate',
    description:
      'Navigate the browser to a URL. Use for the first visit to a site or to jump to a known page.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Absolute URL to navigate to (must include https://)' },
        reason: { type: 'string', description: 'Why you are navigating here' },
      },
      required: ['url', 'reason'],
    },
  },
  {
    name: 'click',
    description:
      'Click an interactive element identified by its ref number from the snapshot. Do NOT use for text inputs — use type instead.',
    input_schema: {
      type: 'object',
      properties: {
        ref: { type: 'number', description: 'The ref number from the snapshot' },
        reason: { type: 'string', description: 'What you expect to happen' },
      },
      required: ['ref', 'reason'],
    },
  },
  {
    name: 'type',
    description: 'Type text into a text input or textarea identified by its ref. Clears existing content first.',
    input_schema: {
      type: 'object',
      properties: {
        ref: { type: 'number', description: 'Ref of the input element' },
        text: { type: 'string', description: 'Text to type' },
        reason: { type: 'string', description: 'What this input is for' },
      },
      required: ['ref', 'text', 'reason'],
    },
  },
  {
    name: 'press',
    description: 'Press a keyboard key (e.g. Enter, Escape, Tab, ArrowDown).',
    input_schema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Key name as a Playwright key string' },
        reason: { type: 'string', description: 'Why you are pressing this key' },
      },
      required: ['key', 'reason'],
    },
  },
  {
    name: 'select',
    description: 'Select an option in a <select> element by its value or visible text.',
    input_schema: {
      type: 'object',
      properties: {
        ref: { type: 'number', description: 'Ref of the <select> element' },
        value: { type: 'string', description: 'The option value or visible label to select' },
        reason: { type: 'string', description: 'Why you are selecting this value' },
      },
      required: ['ref', 'value', 'reason'],
    },
  },
  {
    name: 'scroll',
    description: 'Scroll the page up or down to reveal more content.',
    input_schema: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['up', 'down'], description: 'Scroll direction' },
        amount: { type: 'number', description: 'Pixels to scroll (default 600)' },
        reason: { type: 'string', description: 'What you are trying to reveal' },
      },
      required: ['direction', 'reason'],
    },
  },
  {
    name: 'go_back',
    description: 'Navigate to the previous page in browser history.',
    input_schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Why you are going back' },
      },
      required: ['reason'],
    },
  },
  {
    name: 'extract',
    description:
      'Extract structured data from the current page according to a JSON schema. Use this once you have navigated to the right page and found the information you need.',
    input_schema: {
      type: 'object',
      properties: {
        schema: {
          type: 'object',
          description: 'JSON schema describing the shape of the data to extract',
        },
        description: {
          type: 'string',
          description: 'Plain-English description of what to extract and where to find it',
        },
      },
      required: ['schema', 'description'],
    },
  },
  {
    name: 'finish_step',
    description:
      'Mark the CURRENT step complete and advance to the next step in the plan. Call this as soon as the current step\'s success criterion is met. Include the key facts you gathered in this step — they are carried forward as notes to the remaining steps, so be specific (include values and source URLs). Do NOT use this to end the whole run; use finish for that.',
    input_schema: {
      type: 'object',
      properties: {
        findings: {
          type: 'string',
          description:
            'The concrete facts learned in this step, with source URLs where relevant. This is the only memory the next steps get, so capture everything that matters.',
        },
      },
      required: ['findings'],
    },
  },
  {
    name: 'finish',
    description:
      'Mark the WHOLE run as complete and deliver the final structured result. Call this only when every step is done and you have gathered all required information.',
    input_schema: {
      type: 'object',
      properties: {
        result: {
          type: 'object',
          description: 'The structured result — rows of data, a table, or a summary object',
        },
        summary: {
          type: 'string',
          description: 'One or two sentences explaining what was found and any caveats',
        },
      },
      required: ['result', 'summary'],
    },
  },
  {
    name: 'ask_human',
    description:
      'Ask the user a question when you are genuinely stuck or need information only they can provide. Use sparingly.',
    input_schema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The question to ask' },
        context: { type: 'string', description: 'Brief context explaining why you need this' },
      },
      required: ['question', 'context'],
    },
  },
];

export type ToolName = (typeof AGENT_TOOLS)[number]['name'];
