import * as vscode from 'vscode';

class SideBar implements vscode.WebviewViewProvider {
	_view?: vscode.WebviewView;
	_doc?: vscode.TextDocument;
	constructor(private readonly _extensionUri: vscode.Uri) { }
	public resolveWebviewView(webviewView: vscode.WebviewView, context: vscode.WebviewViewResolveContext<unknown>, token: vscode.CancellationToken): void | Thenable<void> {
		this._view = webviewView;
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				this._extensionUri,
				vscode.Uri.joinPath(this._extensionUri, "out/compiled")
			]
		};
		webviewView.webview.html = this.webViewContent(webviewView.webview);
	}
	private webViewContent(webview: vscode.Webview) {
		const css_file = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'style.css'));
		const js_file = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'out/compiled', 'sideBar.js'));
		return `
			<!DOCTYPE html>
			<html lang="en">
			<head>
			<title>Chatbot</title>
			<link href=${css_file} rel='stylesheet'>
			</head>
			<body>

			</body>
			<script>
			
			console.log('works');
			</script>
			<script src=${js_file} type="module"
			</html>
			`
			;
	}
}
export async function activate(context: vscode.ExtensionContext) {

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			'chat-box',
			new SideBar(context.extensionUri)
		));
	
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'octocode.helloWorld',
			() => {
				vscode.window.showInformationMessage('asdlsa');
			}
		));



}



export function deactivate() {
	vscode.window.showInformationMessage('Bye!');
};

