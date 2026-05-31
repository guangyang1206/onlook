import { CodeProvider, createCodeProviderClient, getStaticCodeProvider, type Provider } from '@onlook/code-provider';

const MAX_RETRIES = 3;
const TIMEOUT_MS = 30000; // 30 seconds

export async function forkBuildSandBox(
    sandboxId: string,
    userId: string,
    deploymentId: string,
): Promise<{ provider: Provider; sandboxId: string }> {
    let lastError: Error | null = null;

    // Retry logic for socket connection issues
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            console.log(`[forkBuildSandBox] Attempt ${attempt}/${MAX_RETRIES} for sandbox ${sandboxId}`);

            const CodesandboxProvider = await getStaticCodeProvider(CodeProvider.CodeSandbox);
            
            // Add timeout to prevent hanging
            const project = await Promise.race([
                CodesandboxProvider.createProject({
                    source: 'template',
                    id: sandboxId,
                    title: 'Deployment Fork of ' + sandboxId,
                    description: 'Forked sandbox for deployment',
                    tags: ['deployment', 'preview', userId, deploymentId],
                }),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('Timeout: CodeSandbox project creation timed out')), TIMEOUT_MS)
                )
            ]);

            const forkedProvider = await createCodeProviderClient(CodeProvider.CodeSandbox, {
                providerOptions: {
                    codesandbox: {
                        sandboxId: (project as any).id,
                        userId,
                        initClient: true,
                    },
                },
            });

            console.log(`[forkBuildSandBox] Successfully forked sandbox ${sandboxId} on attempt ${attempt}`);
            return {
                provider: forkedProvider,
                sandboxId: (project as any).id,
            };
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            console.error(`[forkBuildSandBox] Attempt ${attempt}/${MAX_RETRIES} failed:`, lastError.message);

            // If this is the last attempt, throw the error
            if (attempt === MAX_RETRIES) {
                console.error(`[forkBuildSandBox] All ${MAX_RETRIES} attempts failed for sandbox ${sandboxId}`);
                throw new Error(
                    `Failed to fork sandbox after ${MAX_RETRIES} attempts. ` +
                    `Last error: ${lastError.message}. ` +
                    `This may be due to socket connection issues in Docker/self-hosted environments. ` +
                    `Suggestions: Check network connectivity, increase timeout, or check CodeSandbox service status.`
                );
            }

            // Wait before retrying (exponential backoff)
            const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
            console.log(`[forkBuildSandBox] Retrying in ${backoffMs}ms...`);
            await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
    }

    // This should never be reached, but TypeScript needs it
    throw lastError || new Error('Unknown error in forkBuildSandBox');
}
