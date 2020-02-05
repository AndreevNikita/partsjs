class PageModule {
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

class RecursiveLoadObject {
	isLoaded = false;
	isRecursiveRoot = false;
	
	constructor(path, backLevel) {
		this.path = path;
		this.backLevel = backLevel;
	}
	
	
};

//page-part-ref - элемент, вместо которого будет вставлен элемент page-part-orig
//page-part-orig - элемент, содержащий встраиваемый в page-part-ref элемент код
//page-part-rec - рекурсивный элемент
//page-part-rec-root - рекурсивный элемент, являющийся корневым для остального пути
//data-part-id
//data-uid - уникальный id элемента в head, чтобы не копировать аналогичные элементы из других модулей

//data-part-mode - режим замены
//	child (по умолчанию) - элемент замещается на дочерние из orig
//	orig - замена на оригинальный элемент, в т.ч. атрибутов
//	ref - атрибуты берутся из замещаемого элемента


var PartsLoader = {
	loadCount: 0,
	
	//Для асинхронной загрузки в будущем
	incOrder: function() { this.loadCount++; },
	decOrder: function() { 
		this.loadCount--; 
		if(this.loadCount == 0) {
			//this.build();
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
	
	loadModule: function(path, recursionLoadObject = undefined) {
		//Если модуль уже загружен, ничего не делаем
		//alert();
		if(PartsLoader.loadedModules.find(module => module.path == path) !== undefined) {
			return;
		}
		
		PartsLoader.analizeHead();
		
		var moduleObject = new PageModule(path);
		PartsLoader.loadedModules.push(moduleObject);
		PartsLoader.incOrder();
		
		var url = path;
		let xhr = new XMLHttpRequest();
		xhr.recursionLoadObject = recursionLoadObject;
		xhr.moduleObject = moduleObject;
		xhr.onload = function() {
			if (xhr.status != 200) { 
				console.error("Can't load module " + path + ": " + xhr.status);
				return;
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
				
				PartsLoader.loadOrigPartsFromNode(partDom, xhr.recursionLoadObject);
			}
			PartsLoader.decOrder();
		};
		xhr.open('GET', url, false);
		xhr.send();
	},
	
	loadOrigPartsFromNode: function(node, recursionLoadObject) {
		
		let parts = node.getElementsByClassName("page-part-orig");
		for(let index = 0; index < parts.length; index++) {
			
			if(recursionLoadObject !== undefined)
			if(parts[index].classList.contains("page-part-rec") || (recursionLoadObject.isRecursiveRoot = parts[index].classList.contains("page-part-rec-root"))) {
				recursionLoadObject.part = parts[index];
				recursionLoadObject.isLoaded = true;
				continue;
			}
			
			if(!parts[index].hasAttribute("data-part-id"))
				continue;
			
			if(parts[index].dataset.partId in PartsLoader.loadedParts)
				continue;
			
			PartsLoader.loadedParts[parts[index].dataset.partId] = parts[index];
		}
	},
	
	replaceByOrig: function(refNode, origNode) {
		switch(refNode.dataset.partMode) {
			case "ref": {
				origNode = origNode.cloneNode(true);
				refNode.parentNode.replaceChild(origNode, refNode);
				PartsLoader.removeAttribs(origNode);
				for(let attribIndex = 0; attribIndex < refNode.attributes.length; attribIndex++) {
					origNode.setAttribute(refNode.attributes[attribIndex].name, refNode.attributes[attribIndex].value);
				}
				origNode.classList.remove("page-part-orig");
				origNode.classList.add("page-part-ref");
				origNode.hidden = false;
				break;
			}
			case "orig": {
				origNode = origNode.cloneNode(true);
				refNode.parentNode.replaceChild(origNode, refNode);
				origNode.classList.remove("page-part-orig");
				origNode.classList.add("page-part-ref");
				origNode.hidden = false;
				break;
			}
			case "child":
			default: {
				for(let index = 0; index < origNode.childNodes.length; index++) {
					refNode.before(origNode.childNodes[index].cloneNode(true));
				}
				break;
			}
		}
		
		
	},
	
	loadPageRefsInNode: function(node) {
		let refsArray;
		do {
			refsArray = node.querySelectorAll(".page-part-ref:not(.page-part-rec):not([data-status])");
			for(let index = 0; index < refsArray.length; index++) {
				
				let refNode = refsArray[index];
				
				if(!(refNode.dataset["partId"] in this.loadedParts)) {
					refNode.dataset.status = "origin not found";
					continue;
				}
				
				let origNode = this.loadedParts[refNode.dataset["partId"]];
				this.replaceByOrig(refNode, origNode);
				refNode.dataset.status = "loaded";
			}
		} while(refsArray.length !== 0);
	},
	
	build: function() {
		
		this.loadOrigPartsFromNode(document, this.recursionLoadObjects.length >= 1 ? this.recursionLoadObjects[0] : undefined);
		
		this.loadRecursiveRefsInNode(document);
		this.loadPageRefsInNode(document);
		
	},
	
	recursionLoadObjects: [], //Массив загруженных рекурсивных частей страницы
	//Построение рекурсивных частей страницы
	loadRecursiveRefsInNode: function(node) {
		let recursiveIndex = this.recursionLoadObjects.length - 1;
		if(recursiveIndex == -1)
			return;
		let refsArray;
		do {
			refsArray = node.querySelectorAll(".page-part-ref.page-part-rec:not([data-status])");
			for(let index = 0; index < refsArray.length; index++) {
				let refNode = refsArray[index];
				
				if(recursiveIndex == -1) {
					refNode.dataset.status = "end of rec-parts";
					return;
				}
				
				//Поиск следующей загруженной рекурсивной части
				while((!this.recursionLoadObjects[recursiveIndex].isLoaded) && (--recursiveIndex >= 0));
				
				if(recursiveIndex == -1) {
					refNode.dataset.status = "end of rec-parts";
					return;
				}
				
				let origNode = this.recursionLoadObjects[recursiveIndex].part;
				PartsLoader.replaceByOrig(refNode, origNode);
				refNode.dataset.status = "loaded";
				recursiveIndex--;
			}
		} while(refsArray.length !== 0);
	},
	
	//Загрузка рекурсивных частей страницы
	recursiveBack: function(fileName = "part.html") {
		let myPath = window.location.pathname;
		let currentPath = myPath;
		let slashIndex = -1;
		
		//Наша страница на нулевом уровне в пути
		this.recursionLoadObjects = [];
		let recursionLoadObject = new RecursiveLoadObject(window.location.href, this.recursionLoadObjects.length);
		this.recursionLoadObjects.push(recursionLoadObject);
		
		while((slashIndex = currentPath.lastIndexOf("/")) !== -1) {
			let prevDir = currentPath.substr(0, slashIndex);
			let recModulePath = window.location.protocol + "//" + window.location.host + prevDir + "/" + fileName;
			
			let recursiveLoadObject = new RecursiveLoadObject(recModulePath, this.recursionLoadObjects.length);
			this.recursionLoadObjects.push(recursiveLoadObject);
			
			this.loadModule(recModulePath, recursiveLoadObject);
			if(recursiveLoadObject.isRecursiveRoot) {
				break;
			}
			currentPath = prevDir;
		}
	}
	
};

document.addEventListener("DOMContentLoaded", () => { PartsLoader.build(); });
