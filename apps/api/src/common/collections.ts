/** Whether any value occurs more than once. */
export const hasDuplicates = (values: readonly unknown[]) => new Set(values).size !== values.length;
