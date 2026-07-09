export function getActiveDocument(): Document {
	return window.activeDocument;
}

export function getActiveBody(): HTMLElement {
	return getActiveDocument().body;
}

export function getActiveSelection(): Selection | null {
	return getActiveDocument().getSelection();
}

export function isHtmlElement(value: EventTarget | Node | null): value is HTMLElement {
	return Boolean(value && (value as Node).instanceOf?.(HTMLElement));
}

export function isInputEvent(event: Event): event is InputEvent {
	return (event as UIEvent).instanceOf(InputEvent);
}
