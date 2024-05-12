<script>
    
    import { onMount } from "svelte";

    import snarkdown from 'snarkdown'
    let promise = 'nothing';
    let prompt = '';
    let finPrompt;
    function registerPrompt(){
        finPrompt = prompt;
    }
    async function getAi (){
        const response = await fetch(
            "https://api-inference.huggingface.co/models/meta-llama/Meta-Llama-3-8B-Instruct",
            {
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer `,
                },
                method: "POST",
                body: JSON.stringify({"inputs": `${prompt}`})
            },
        );
        promise = await response.json();
        
    };
</script>

<div class="container">
    <p>Your prompt: {finPrompt||'None'}</p>
    {#await promise}
    <p>waiting...</p>
    {:then output}
    <p>Reponse: </p>
    <p>{@html snarkdown(output[0]['generated_text']||'Enter a prompt')}</p>
    {:catch error}
    <p>{error.message}</p>
    {/await}
    
    <input class="chatBox" type="text" id="txt" placeholder="Enter prompt" bind:value={prompt} />
    <button class="send" id="send_button" on:click={()=>{getAi();registerPrompt();}}>Send</button>
</div>

<style>
    
</style>
