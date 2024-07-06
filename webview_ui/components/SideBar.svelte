<script>
    
    import snarkdown from 'snarkdown'
    let promise = 'nothing';
    let prompt = '';
    let finPrompt;
    let page = false;
    let api_key = '';
    let model_url = '';
    function registerPrompt(){
        finPrompt = prompt;
    }
    function registerApi(){
        page=true;
    }
    async function getAi (){
        const response = await fetch(
            `${model_url}`,
            {
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${api_key}`,
                },
                method: "POST",
                body: JSON.stringify({"inputs": `${prompt}`})
            },
        );
        promise = await response.json();
        
    };
    
</script>

<div class="container">
    {#if !page}
        <p>Welcome to Octocode!</p>
        <div class="chatBox">
            <input type="text" id="api_key" placeholder="Enter Model Url:" bind:value={model_url} />
            <input type="text" id="api_key" placeholder="Enter authentication key:" bind:value={api_key} />
        </div>
        <button class="send" id="send_button" on:click={()=>{registerApi();}}>Send</button>
    {:else}
        <p>Your prompt:<br/> {finPrompt||'None'}</p>
        <p>{@html snarkdown(promise[0]['generated_text']||'Enter a prompt')}</p>
        <input class="chatBox" type="text" id="txt" placeholder="Enter prompt" bind:value={prompt} />
        <button class="send" id="send_button" on:click={()=>{getAi();registerPrompt();}}>Send</button>
    {/if}
</div>

<style>
    
</style>