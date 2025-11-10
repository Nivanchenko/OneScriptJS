

class OneScriptElement extends HTMLElement { 
    
    constructor() {
        super();
    }

    connectedCallback() {
        this.style.display = 'none';
        this.hidden = true;
        setTimeout(() => this.computeScript(this.innerHTML));
    }

    computeScript(text) {
        runscript(text);
    }

}

customElements.define("one-script", OneScriptElement);