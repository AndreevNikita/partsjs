class Module {
	loadedOuterScriptsCounter = 0;
	outerScripts = [];
	innerScripts = [];
	
	constructor(path) {
		this.path = path;
	}
	
	loadInnerScripts() {
		for(let index = 0; index < this.innerScripts.length; index++) {
			document.head.appendChild(this.innerScripts[index]);
		}
	}
	
	onOuterScriptLoaded(scriptElement) {
		this.loadedOuterScriptsCounter++;
		if(this.loadedOuterScriptsCounter == this.outerScripts.length) {
			this.loadInnerScripts();
		}
	}
	
	addScriptToLoad(scriptElement) {
		//Для внешних скриптов заставляем функцию ждать, пока они не загрузятся
		if(scriptElement.hasAttribute("src")) {
			scriptElement.module = this;
			scriptElement.onload = function() { 
				this.module.onOuterScriptLoaded(this);
			};
			this.outerScripts.push(scriptElement);
		} else {
			this.innerScripts.push(scriptElement);
		}
	}
	
	loadScripts() {
		if(this.outerScripts.length != 0) {
			for(let index = 0; index < this.outerScripts.length; index++) {
				if(!PartsLoader.safeAppendToHead(this.outerScripts[index])) {
					this.outerScripts[index].onload();
				}
			}
		} else {
			this.loadInnerScripts();
		}
	}
};

//data-part-ref - элемент, вместо которого будет вставлен элемент data-part-orig
//data-part-orig - элемент, содержащий встраиваемый в data-part-ref элемент код
//data-uid - уникальный id элемента в head, чтобы не копировать аналогичные элементы из других модулей

var PartsLoader = {
	loadCount: 0,
	
	//Для асинхронной загрузки в будущем
	incOrder: function() { this.loadCount++; },
	decOrder: function() { 
		this.loadCount--; 
		if(this.loadCount == 0) {
			if(document.readyState === "interactive" || document.readyState === "complete") {
				this.build();
			}
		}
	},
	
	headUIDs: [],
	isHeadAnalized: false,
	analizeHead: function() {
		if(this.isHeadAnalized)
			return;
		
		let uidElements = document.head.querySelectorAll("[data-uid]");
		for(let index = 0; index < uidElements.length; index++) {
			this.headUIDs.push(uidElements[index].dataset.uid);
		}
		this.isHeadAnalized = true;
	},
	
	safeAppendToHead: function(node) {
		if(node.hasAttribute("data-uid")) {
			if(this.headUIDs.includes(node.dataset.uid))
				return false;
		}
		
		this.headUIDs.push(node.dataset.uid);
		document.head.appendChild(node);
		return true;
	},
	
	loadedModules: [], //Загруженные модули
	loadedParts: [], //Загруженные части страницы
	
	removeAttribs: function(node) {
		while(node.attributes.length != 0) {
			node.removeAttribute(node.attributes[0].name); 
		}
	},
	
	documentClone: function(node) { //Вспомогательная создания аналогичного элемента с помощью document.createElement по некоторому другому элементу
		let result = document.createElement(node.tagName);
		//result.attributes.clear();
		for(let index = 0; index < node.attributes.length; index++) {
			result.setAttribute(node.attributes[index].name, node.attributes[index].value);
		}
		result.innerHTML = node.innerHTML;
		return result;
	},
	
	loadModule: function(path) {
		//Если модуль уже загружен, ничего не делаем
		//alert();
		if(PartsLoader.loadedModules.find(module => module.path == path) !== undefined) {
			return;
		}
		
		PartsLoader.analizeHead();
		
		var moduleObject = new Module(path);
		PartsLoader.loadedModules.push(moduleObject);
		PartsLoader.incOrder();
		
		var url = path;
		let xhr = new XMLHttpRequest();
		xhr.moduleObject = moduleObject;
		xhr.onload = function() {
			if (xhr.status != 200) { 
				console.error("Can't load module " + path + ": " + xhr.status);
			} else {

				let partDom = new DOMParser().parseFromString(xhr.responseText, "text/html");
				this.moduleObject.dom = partDom;
				
				let arr = partDom.getElementsByTagName("head");
				
				if(arr.length == 1) {
					let loadedHead = arr[0];
					
					for(let index = 0; index < loadedHead.childNodes.length; index++) {
						let loadElement = loadedHead.childNodes[index];
						if(loadElement.tagName === undefined)
							continue;
						let appendElement = PartsLoader.documentClone(loadElement);
						
						if(appendElement.tagName.toLowerCase() === "script") {
							xhr.moduleObject.addScriptToLoad(appendElement);
							continue;
						}
						
						PartsLoader.safeAppendToHead(appendElement);
					}
					
					xhr.moduleObject.loadScripts();
				}
				
				PartsLoader.loadOrigPartsFromNode(partDom);
			}
			PartsLoader.decOrder();
		};
		xhr.open('GET', url, false);
		xhr.send();
	},
	
	loadOrigPartsFromNode: function(node) {
		let parts = node.getElementsByClassName("page-part-orig");
		for(let index = 0; index < parts.length; index++) {
			if(parts[index].dataset.partId in PartsLoader.loadedParts)
				continue;
			
			PartsLoader.loadedParts[parts[index].dataset.partId] = PartsLoader.documentClone(parts[index]);
		}
	},
	
	loadPageRefsInNode: function(node) {
		let refsArray = node.getElementsByClassName("page-part-ref");
		for(let index = 0; index < refsArray.length; index++) {
			let refNode = refsArray[index];
			if(refNode.getAttribute("data-status") !== "loaded") {
				if(!(refNode.dataset["partId"] in this.loadedParts)) {
					refNode.dataset.status = "origin not found";
					continue;
				}
				
				let origNode = this.loadedParts[refNode.dataset["partId"]].cloneNode(true);
				
				refNode.parentNode.replaceChild(origNode, refNode);
				if(refNode.hasAttribute("data-part-ext")) {
					let extendsPart = refNode.dataset["partExt"];
					if(extendsPart === "ref") {
						PartsLoader.removeAttribs(origNode);
						for(let attribIndex = 0; attribIndex < refNode.attributes.length; attribIndex++) {
							origNode.setAttribute(refNode.attributes[attribIndex].name, refNode.attributes[attribIndex].value);
						}
					}
				}
				
				origNode.classList.remove("page-part-orig");
				origNode.classList.add("page-part-ref");
				origNode.dataset.status = "loaded";
				origNode.hidden = false;
				
				refNode = origNode;
			}
			this.loadPageRefsInNode(refNode);
			
		}
	},
	
	onDOMLoaded: function() {
		this.build();
	},
	
	build: function() {
		this.loadOrigPartsFromNode(document);
		
		this.loadPageRefsInNode(document);
		
	},
	
};

document.addEventListener("DOMContentLoaded", () => {PartsLoader.onDOMLoaded()});