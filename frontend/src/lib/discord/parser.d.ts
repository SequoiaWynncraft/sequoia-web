/** The simple-markdown AST node shape: a rule name plus rule-specific data. */
export interface SingleASTNode {
  type: string;
  [key: string]: unknown;
}

export type Capture = RegExpExecArray | (string[] & { index?: number });

export interface State {
  inline?: boolean;
  prevCapture?: Capture | null;
  [key: string]: unknown;
}

export type NestedParse = (source: string, state?: State) => SingleASTNode[];

export interface ParserRule {
  order: number;
  match: (source: string, state: State, previous: string) => Capture | null | undefined;
  parse: (capture: Capture, parse: NestedParse, state: State) => Record<string, unknown> | SingleASTNode[];
}

export const SimpleMarkdown: {
  defaultRules: Record<string, ParserRule>;
  parserFor: (rules: Record<string, ParserRule>) => (source: string, state?: State) => SingleASTNode[];
};

export const rulesExtended: Record<string, ParserRule>;
