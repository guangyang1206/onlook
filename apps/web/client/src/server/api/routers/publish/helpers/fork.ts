import { CodeProvider, createCodeProviderClient, getStaticCodeProvider, type Provider } from '@onlook/code-provider';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

export async function forkBuildSandbox(
    sandboxId: string,
    userId: string,
    deploymentId: string,
): Promise<{ provider: Provider; sandboxId: string }> {
    const CodesandboxProvider = await getStaticCodeProvider(CodeProvider.CodeSandbox);
    
    // Create forked sandbox from template with retry logic
    let project;
    let lastError;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            project = await CodesandboxProvider.createProject({
                source: 'template',
                id: sandboxId,
                title: 'Deployment Fork of ' + sandboxId,
                description: 'Forked sandbox for deployment',
                tags: ['deployment', 'preview', userId, deploymentId],
            });
            break; // Success, exit retry loop
        } catch (error) {
            lastError = error;
            console.error(`Failed to create forked sandbox (attempt ${attempt}/${MAX_RETRIES}):`, error);
            
            if (attempt < MAX_RETRIES) {
                console.log(`Retrying in ${RETRY_DELAY_MS}ms...`);
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
            }
        }
    }
    
    if (!project) {
        throw new Error(
            `Failed to create forked sandbox after ${MAX_RETRIES} attempts. ` +
            `Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}. ` +
            `This may be due to network issues or sandbox service unavailability.`
        );
    }

    // Connect to the forked sandbox with retry logic for WebSocket connection
    let forkedProvider;
    lastError = null;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            forkedProvider = await createCodeProviderClient(CodeProvider.CodeSandbox, {
                providerOptions: {
                    codesandbox: {
                        sandboxId: project.id,
                        userId,
                        initClient: true,
                    },
                },
            });
            break; // Success, exit retry loop
        } catch (error) {
            lastError = error;
            console.error(`Failed to connect to forked sandbox (attempt ${attempt}/${MAX_RETRIES}):`, error);
            
            if (attempt < MAX_RETRIES) {
                console.log(`Retrying WebSocket connection in ${RETRY_DELAY_MS}ms...`);
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
            }
        }
    }
    
    if (!forkedProvider) {
        throw new Error(
            `Failed to connect to forked sandbox after ${MAX_RETRIES} attempts. ` +
            `The sandbox was created (ID: ${project.id}), but the WebSocket connection failed. ` +
            `Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}. ` +
            `This may be due to network issues or firewall blocking WebSocket connections.`
        );
    }

    console.log(`Successfully created and connected to forked sandbox: ${project.id}`);
    
    return {
        provider: forkedProvider,
        sandboxId: project.id,
    };
}
