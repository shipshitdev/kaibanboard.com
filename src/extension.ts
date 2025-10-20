import * as vscode from "vscode";
import { KanbanViewProvider } from "./kanbanView";

let kanbanView: KanbanViewProvider;

export function activate(context: vscode.ExtensionContext) {
  console.log("Kaiban Markdown extension activated");

  kanbanView = new KanbanViewProvider(context);

  // Register command to show board
  const showBoardCommand = vscode.commands.registerCommand(
    "kaiban.showBoard",
    async () => {
      try {
        await kanbanView.show();
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to show Kaiban board: ${error}`);
      }
    }
  );

  // Register command to refresh board
  const refreshBoardCommand = vscode.commands.registerCommand(
    "kaiban.refreshBoard",
    async () => {
      try {
        await kanbanView.refresh();
        vscode.window.showInformationMessage("Kaiban board refreshed");
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to refresh board: ${error}`);
      }
    }
  );

  context.subscriptions.push(showBoardCommand, refreshBoardCommand);

  // Show welcome message
  vscode.window
    .showInformationMessage(
      'Kaiban Markdown is ready! Use "Kaiban: Show Markdown Board" command to open.',
      "Open Board"
    )
    .then((selection) => {
      if (selection === "Open Board") {
        vscode.commands.executeCommand("kaiban.showBoard");
      }
    });
}

export function deactivate() {
  console.log("Kaiban Markdown extension deactivated");
}
