package app.kennwort.autofill

import android.app.assist.AssistStructure
import android.os.Build
import android.view.View

/**
 * K-802: the system's AssistStructure as the [FormNode]s FieldDetection.kt reads. Text is read
 * only when saving (`withText`), never to decide where to fill.
 */
object StructureReader {
  fun read(structure: AssistStructure, withText: Boolean = false): List<FormNode> =
    (0 until structure.windowNodeCount).map { node(structure.getWindowNodeAt(it).rootViewNode, withText) }

  private fun node(view: AssistStructure.ViewNode, withText: Boolean): FormNode {
    val html = view.htmlInfo?.attributes.orEmpty().associate { (it.first ?: "").lowercase() to it.second }
    val fillable = view.autofillType == View.AUTOFILL_TYPE_TEXT
    return FormNode(
      id = view.autofillId,
      hints = view.autofillHints?.toList().orEmpty(),
      inputType = view.inputType,
      htmlType = html["type"].takeIf { view.htmlInfo?.tag.equals("input", ignoreCase = true) },
      htmlAutocomplete = html["autocomplete"],
      idEntry = view.idEntry,
      hint = view.hint,
      webDomain = view.webDomain,
      webScheme = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) view.webScheme else null,
      fillable = fillable,
      visible = view.visibility == View.VISIBLE,
      text = if (withText && fillable) view.autofillValue?.takeIf { it.isText }?.textValue?.toString() else null,
      children = (0 until view.childCount).map { node(view.getChildAt(it), withText) },
    )
  }
}
