"""
Part 2: win32com — add VBA UserForms + Plus buttons to each data sheet.
Opens C:\Temp\kehila_base.xlsx, adds VBA, saves as .xlsm.
"""
import sys, os, time
sys.stdout.reconfigure(encoding="utf-8")
import win32com.client as win32

XL_FMT_XLSM = 52   # xlOpenXMLWorkbookMacroEnabled
PT = 1              # coordinate unit is points

# ─────────────────────────────────────────────────────────────────────────────
# VBA code strings
# ─────────────────────────────────────────────────────────────────────────────

MAIN_MOD = r"""
Option Explicit

' ── helpers ──────────────────────────────────────────────────────────────────
Function NextId(ws As Worksheet, prefix As String) As String
    Dim r As Long
    r = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row
    If r < 2 Then r = 2
    NextId = prefix & Format(r - 1, "000")
End Function

Function GetSynIds() As String()
    Dim ws As Worksheet
    Dim ids() As String
    Dim i As Long, n As Long
    On Error Resume Next
    Set ws = ThisWorkbook.Sheets(ChrW(1489) & ChrW(1514) & ChrW(1497) & "_" & ChrW(1499) & ChrW(1504) & ChrW(1505) & ChrW(1514))
    On Error GoTo 0
    If ws Is Nothing Then ReDim ids(0): ids(0) = "": GetSynIds = ids: Exit Function
    Dim last As Long: last = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row
    n = 0
    For i = 3 To last
        If Trim(CStr(ws.Cells(i, 1).Value)) <> "" Then n = n + 1
    Next i
    If n = 0 Then ReDim ids(0): ids(0) = "": GetSynIds = ids: Exit Function
    ReDim ids(n - 1)
    n = 0
    For i = 3 To last
        If Trim(CStr(ws.Cells(i, 1).Value)) <> "" Then
            ids(n) = CStr(ws.Cells(i, 1).Value): n = n + 1
        End If
    Next i
    GetSynIds = ids
End Function

Sub AppendRow(ws As Worksheet, vals() As Variant)
    Dim r As Long
    r = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row + 1
    If r < 3 Then r = 3
    Dim i As Long
    For i = 0 To UBound(vals)
        ws.Cells(r, i + 1).Value = vals(i)
    Next i
End Sub

' ── entry points called from sheet buttons ────────────────────────────────────
Sub AddSynagogue()     : frmSynagogue.Show : End Sub
Sub AddPrayer()        : frmPrayer.Show    : End Sub
Sub AddRestaurant()    : frmRestaurant.Show: End Sub
Sub AddMikveh()        : frmMikveh.Show    : End Sub
Sub AddEvent()         : frmEvent.Show     : End Sub
Sub AddShiur()         : frmShiur.Show     : End Sub
"""

# ── per-form event code ────────────────────────────────────────────────────────

CODE_SYN = r"""
Private Sub UserForm_Initialize()
    cmbNusach.AddItem "ashkenaz"
    cmbNusach.AddItem "sefard"
    cmbNusach.AddItem "edot_hamizrach"
    cmbNusach.AddItem "maroko"
    cmbNusach.AddItem "other"
    cmbNusach.ListIndex = 0
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Sheets(ChrW(1489) & ChrW(1514) & ChrW(1497) & "_" & ChrW(1499) & ChrW(1504) & ChrW(1505) & ChrW(1514))
    On Error GoTo 0
    If Not ws Is Nothing Then
        txtId.Value = NextId(ws, "syn-")
    End If
End Sub

Private Sub btnAdd_Click()
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Sheets(ChrW(1489) & ChrW(1514) & ChrW(1497) & "_" & ChrW(1499) & ChrW(1504) & ChrW(1505) & ChrW(1514))
    On Error GoTo 0
    If ws Is Nothing Then MsgBox "Sheet not found", vbCritical: Exit Sub
    If Trim(txtId.Value) = "" Or Trim(txtName.Value) = "" Or cmbNusach.ListIndex < 0 Then
        MsgBox ChrW(1502) & ChrW(1494) & ChrW(1492) & " " & ChrW(1493) & ChrW(1513) & ChrW(1501) & " " & ChrW(1500) & ChrW(1489) & ChrW(1497) & ChrW(1514) & " " & ChrW(1499) & ChrW(1504) & ChrW(1505) & ChrW(1514) & " " & ChrW(1492) & ChrW(1501) & " " & ChrW(1513) & ChrW(1491) & ChrW(1493) & ChrW(1514) & " " & ChrW(1495) & ChrW(1493) & ChrW(1489) & ChrW(1492), vbExclamation
        Exit Sub
    End If
    Dim v(15) As Variant
    v(0) = Trim(txtId.Value): v(1) = Trim(txtName.Value): v(2) = Trim(txtNeighborhood.Value)
    v(3) = Trim(txtAddrHe.Value): v(4) = Trim(txtAddrEn.Value)
    v(5) = cmbNusach.Value
    v(6) = Trim(txtPhone.Value): v(7) = Trim(txtRabbiName.Value): v(8) = Trim(txtRabbiPhone.Value)
    v(9) = Trim(txtGabbaiName.Value): v(10) = Trim(txtGabbaiPhone.Value)
    v(11) = Trim(txtLat.Value): v(12) = Trim(txtLon.Value)
    v(13) = Trim(txtWaze.Value): v(14) = Trim(txtNavNote.Value): v(15) = Trim(txtNotes.Value)
    AppendRow ws, v
    MsgBox ChrW(1504) & ChrW(1493) & ChrW(1505) & ChrW(1507) & " " & ChrW(1489) & ChrW(1492) & ChrW(1510) & ChrW(1500) & ChrW(1495) & ChrW(1492) & "!", vbInformation
    Unload Me
End Sub

Private Sub btnCancel_Click(): Unload Me: End Sub
"""

CODE_PRAY = r"""
Private Sub UserForm_Initialize()
    Dim ids() As String
    ids = GetSynIds()
    Dim i As Long
    For i = 0 To UBound(ids)
        If ids(i) <> "" Then cmbSynId.AddItem ids(i)
    Next i
    If cmbSynId.ListCount > 0 Then cmbSynId.ListIndex = 0

    cmbPrayerType.AddItem "shacharit"
    cmbPrayerType.AddItem "mincha"
    cmbPrayerType.AddItem "maariv"
    cmbPrayerType.ListIndex = 0

    cmbScheduleType.AddItem "weekday"
    cmbScheduleType.AddItem "shabbat"
    cmbScheduleType.AddItem "friday_mincha"
    cmbScheduleType.ListIndex = 0

    cmbAnchor.AddItem ""
    cmbAnchor.AddItem "netz"
    cmbAnchor.AddItem "shkia"
    cmbAnchor.AddItem "chatzot"
    cmbAnchor.AddItem "minchaGedola"
    cmbAnchor.AddItem "minchaKetana"
    cmbAnchor.AddItem "plagHamincha"
    cmbAnchor.ListIndex = 0
End Sub

Private Sub btnAdd_Click()
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Sheets(ChrW(1514) & ChrW(1508) & ChrW(1497) & ChrW(1500) & ChrW(1493) & ChrW(1514) & "_" & ChrW(1502) & ChrW(1508) & ChrW(1493) & ChrW(1512) & ChrW(1496) & ChrW(1493) & ChrW(1514))
    On Error GoTo 0
    If ws Is Nothing Then MsgBox "Sheet not found", vbCritical: Exit Sub
    If cmbSynId.ListIndex < 0 Or cmbPrayerType.ListIndex < 0 Or cmbScheduleType.ListIndex < 0 Then
        MsgBox ChrW(1502) & ChrW(1492) & " " & ChrW(1513) & ChrW(1491) & ChrW(1493) & ChrW(1514) & " " & ChrW(1492) & ChrW(1495) & ChrW(1493) & ChrW(1489) & ChrW(1492), vbExclamation
        Exit Sub
    End If
    If Trim(txtTime.Value) = "" And cmbAnchor.Value = "" Then
        MsgBox ChrW(1497) & ChrW(1513) & " " & ChrW(1500) & ChrW(1502) & ChrW(1500) & ChrW(1488) & " " & ChrW(1513) & ChrW(1506) & ChrW(1492) & " " & ChrW(1488) & ChrW(1493) & " " & ChrW(1506) & ChrW(1493) & ChrW(1490) & ChrW(1503), vbExclamation
        Exit Sub
    End If
    Dim v(7) As Variant
    v(0) = cmbSynId.Value: v(1) = cmbPrayerType.Value: v(2) = cmbScheduleType.Value
    v(3) = Trim(txtDays.Value): v(4) = Trim(txtTime.Value)
    v(5) = cmbAnchor.Value: v(6) = Trim(txtOffset.Value): v(7) = Trim(txtNotes.Value)
    AppendRow ws, v
    MsgBox ChrW(1504) & ChrW(1493) & ChrW(1505) & ChrW(1507) & " " & ChrW(1489) & ChrW(1492) & ChrW(1510) & ChrW(1500) & ChrW(1495) & ChrW(1492) & "!", vbInformation
    Unload Me
End Sub

Private Sub btnCancel_Click(): Unload Me: End Sub
"""

CODE_REST = r"""
Private Sub UserForm_Initialize()
    cmbCategory.AddItem "meat"
    cmbCategory.AddItem "dairy"
    cmbCategory.AddItem "pareve"
    cmbCategory.AddItem "cafe"
    cmbCategory.AddItem "bakery"
    cmbCategory.ListIndex = 0
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Sheets(ChrW(1502) & ChrW(1505) & ChrW(1506) & ChrW(1491) & ChrW(1493) & ChrW(1514) & "_" & ChrW(1499) & ChrW(1513) & ChrW(1512) & ChrW(1493) & ChrW(1514))
    On Error GoTo 0
    If Not ws Is Nothing Then txtId.Value = NextId(ws, "rest-")
End Sub

Private Sub btnAdd_Click()
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Sheets(ChrW(1502) & ChrW(1505) & ChrW(1506) & ChrW(1491) & ChrW(1493) & ChrW(1514) & "_" & ChrW(1499) & ChrW(1513) & ChrW(1512) & ChrW(1493) & ChrW(1514))
    On Error GoTo 0
    If ws Is Nothing Then MsgBox "Sheet not found", vbCritical: Exit Sub
    If Trim(txtId.Value) = "" Or Trim(txtName.Value) = "" Or Trim(txtAddress.Value) = "" Or cmbCategory.ListIndex < 0 Then
        MsgBox ChrW(1513) & ChrW(1491) & ChrW(1493) & ChrW(1514) & " " & ChrW(1495) & ChrW(1493) & ChrW(1489) & ChrW(1492) & " " & ChrW(1495) & ChrW(1505) & ChrW(1512) & ChrW(1497) & ChrW(1501), vbExclamation
        Exit Sub
    End If
    Dim v(23) As Variant
    v(0) = Trim(txtId.Value): v(1) = Trim(txtName.Value): v(2) = cmbCategory.Value
    v(3) = Trim(txtNeighborhood.Value): v(4) = Trim(txtAddress.Value): v(5) = Trim(txtPhone.Value)
    v(6) = Trim(txtWebsite.Value): v(7) = Trim(txtLat.Value): v(8) = Trim(txtLon.Value)
    v(9) = "": v(10) = ""
    Dim days(6) As String
    days(0) = Trim(txtSun.Value): days(1) = Trim(txtMon.Value): days(2) = Trim(txtTue.Value)
    days(3) = Trim(txtWed.Value): days(4) = Trim(txtThu.Value): days(5) = Trim(txtFri.Value)
    days(6) = Trim(txtSat.Value)
    Dim d As Long
    For d = 0 To 6: v(11 + d) = days(d): Next d
    v(18) = Trim(txtKosherBy.Value): v(19) = Trim(txtCertNum.Value): v(20) = Trim(txtKosherLevel.Value)
    v(21) = Trim(txtValidFrom.Value): v(22) = Trim(txtValidUntil.Value): v(23) = Trim(txtKosherNotes.Value)
    AppendRow ws, v
    MsgBox ChrW(1504) & ChrW(1493) & ChrW(1505) & ChrW(1508) & " " & ChrW(1489) & ChrW(1492) & ChrW(1510) & ChrW(1500) & ChrW(1495) & ChrW(1492) & "!", vbInformation
    Unload Me
End Sub

Private Sub btnCancel_Click(): Unload Me: End Sub
"""

CODE_MIK = r"""
Private Sub UserForm_Initialize()
    cmbType.AddItem "women"
    cmbType.AddItem "men"
    cmbType.AddItem "both"
    cmbType.ListIndex = 0
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Sheets(ChrW(1502) & ChrW(1511) & ChrW(1493) & ChrW(1493) & ChrW(1488) & ChrW(1493) & ChrW(1514))
    On Error GoTo 0
    If Not ws Is Nothing Then txtId.Value = NextId(ws, "mik-")
End Sub

Private Sub btnAdd_Click()
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Sheets(ChrW(1502) & ChrW(1511) & ChrW(1493) & ChrW(1493) & ChrW(1488) & ChrW(1493) & ChrW(1514))
    On Error GoTo 0
    If ws Is Nothing Then MsgBox "Sheet not found", vbCritical: Exit Sub
    If Trim(txtId.Value) = "" Or Trim(txtName.Value) = "" Or Trim(txtAddress.Value) = "" Then
        MsgBox ChrW(1513) & ChrW(1491) & ChrW(1493) & ChrW(1514) & " " & ChrW(1495) & ChrW(1493) & ChrW(1489) & ChrW(1492), vbExclamation: Exit Sub
    End If
    Dim v(17) As Variant
    v(0) = Trim(txtId.Value): v(1) = Trim(txtName.Value): v(2) = cmbType.Value
    v(3) = Trim(txtNeighborhood.Value): v(4) = Trim(txtAddress.Value): v(5) = Trim(txtPhone.Value)
    v(6) = IIf(chkAppt.Value, "yes", "no"): v(7) = Trim(txtApptPhone.Value)
    v(8) = Trim(txtLat.Value): v(9) = Trim(txtLon.Value): v(10) = Trim(txtNotes.Value)
    Dim days(6) As String
    days(0) = Trim(txtSun.Value): days(1) = Trim(txtMon.Value): days(2) = Trim(txtTue.Value)
    days(3) = Trim(txtWed.Value): days(4) = Trim(txtThu.Value): days(5) = Trim(txtFri.Value)
    days(6) = Trim(txtSat.Value)
    Dim d As Long
    For d = 0 To 6: v(11 + d) = days(d): Next d
    AppendRow ws, v
    MsgBox ChrW(1504) & ChrW(1493) & ChrW(1505) & ChrW(1507) & " " & ChrW(1489) & ChrW(1492) & ChrW(1510) & ChrW(1500) & ChrW(1495) & ChrW(1492) & "!", vbInformation
    Unload Me
End Sub

Private Sub btnCancel_Click(): Unload Me: End Sub
"""

CODE_EVT = r"""
Private Sub UserForm_Initialize()
    cmbCategory.AddItem "shiur"
    cmbCategory.AddItem "community"
    cmbCategory.AddItem "youth"
    cmbCategory.AddItem "charity"
    cmbCategory.AddItem "holiday"
    cmbCategory.AddItem "announcement"
    cmbCategory.AddItem "alert"
    cmbCategory.ListIndex = 0
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Sheets(ChrW(1488) & ChrW(1497) & ChrW(1512) & ChrW(1493) & ChrW(1506) & ChrW(1497) & ChrW(1501) & "_" & ChrW(1493) & ChrW(1513) & ChrW(1497) & ChrW(1506) & ChrW(1493) & ChrW(1512) & ChrW(1497) & ChrW(1501))
    On Error GoTo 0
    If Not ws Is Nothing Then txtId.Value = NextId(ws, "evt-")
End Sub

Private Sub btnAdd_Click()
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Sheets(ChrW(1488) & ChrW(1497) & ChrW(1512) & ChrW(1493) & ChrW(1506) & ChrW(1497) & ChrW(1501) & "_" & ChrW(1493) & ChrW(1513) & ChrW(1497) & ChrW(1506) & ChrW(1493) & ChrW(1512) & ChrW(1497) & ChrW(1501))
    On Error GoTo 0
    If ws Is Nothing Then MsgBox "Sheet not found", vbCritical: Exit Sub
    If Trim(txtId.Value) = "" Or Trim(txtTitle.Value) = "" Or Trim(txtStartDate.Value) = "" Then
        MsgBox ChrW(1513) & ChrW(1491) & ChrW(1493) & ChrW(1514) & " " & ChrW(1495) & ChrW(1493) & ChrW(1489) & ChrW(1492), vbExclamation: Exit Sub
    End If
    Dim v(9) As Variant
    v(0) = Trim(txtId.Value): v(1) = Trim(txtTitle.Value): v(2) = Trim(txtDesc.Value)
    v(3) = cmbCategory.Value: v(4) = Trim(txtStartDate.Value): v(5) = Trim(txtEndDate.Value)
    v(6) = Trim(txtLocation.Value): v(7) = Trim(txtOrganizer.Value)
    v(8) = IIf(chkAlert.Value, "yes", "no"): v(9) = ""
    AppendRow ws, v
    MsgBox ChrW(1504) & ChrW(1493) & ChrW(1505) & ChrW(1507) & " " & ChrW(1489) & ChrW(1492) & ChrW(1510) & ChrW(1500) & ChrW(1495) & ChrW(1492) & "!", vbInformation
    Unload Me
End Sub

Private Sub btnCancel_Click(): Unload Me: End Sub
"""

CODE_SHI = r"""
Private Sub UserForm_Initialize()
    Dim ids() As String
    ids = GetSynIds()
    Dim i As Long
    For i = 0 To UBound(ids)
        If ids(i) <> "" Then cmbSynId.AddItem ids(i)
    Next i
    If cmbSynId.ListCount > 0 Then cmbSynId.ListIndex = 0
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Sheets(ChrW(1513) & ChrW(1497) & ChrW(1506) & ChrW(1493) & ChrW(1512) & ChrW(1497) & ChrW(1501) & "_" & ChrW(1511) & ChrW(1489) & ChrW(1493) & ChrW(1506) & ChrW(1497) & ChrW(1501))
    On Error GoTo 0
    If Not ws Is Nothing Then txtShiurId.Value = NextId(ws, "shi-")
End Sub

Private Sub btnAdd_Click()
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Sheets(ChrW(1513) & ChrW(1497) & ChrW(1506) & ChrW(1493) & ChrW(1512) & ChrW(1497) & ChrW(1501) & "_" & ChrW(1511) & ChrW(1489) & ChrW(1493) & ChrW(1506) & ChrW(1497) & ChrW(1501))
    On Error GoTo 0
    If ws Is Nothing Then MsgBox "Sheet not found", vbCritical: Exit Sub
    If cmbSynId.ListIndex < 0 Or Trim(txtShiurId.Value) = "" Or Trim(txtTitle.Value) = "" Then
        MsgBox ChrW(1513) & ChrW(1491) & ChrW(1493) & ChrW(1514) & " " & ChrW(1495) & ChrW(1493) & ChrW(1489) & ChrW(1492), vbExclamation: Exit Sub
    End If
    Dim v(6) As Variant
    v(0) = cmbSynId.Value: v(1) = Trim(txtShiurId.Value): v(2) = Trim(txtTitle.Value)
    v(3) = Trim(txtRabbi.Value): v(4) = Trim(txtDays.Value): v(5) = Trim(txtTime.Value)
    v(6) = Trim(txtDesc.Value)
    AppendRow ws, v
    MsgBox ChrW(1504) & ChrW(1493) & ChrW(1505) & ChrW(1507) & " " & ChrW(1489) & ChrW(1492) & ChrW(1510) & ChrW(1500) & ChrW(1495) & ChrW(1492) & "!", vbInformation
    Unload Me
End Sub

Private Sub btnCancel_Click(): Unload Me: End Sub
"""

# ─────────────────────────────────────────────────────────────────────────────
# Form layout helpers
# ─────────────────────────────────────────────────────────────────────────────

def ctrl(d, prog_id, **kw):
    c = d.Controls.Add(prog_id)
    for k, v in kw.items():
        try:
            setattr(c, k, v)
        except Exception:
            pass
    try:
        c.Font.Name = "Arial"
        c.Font.Size = 9
    except Exception:
        pass
    return c

def lbl(d, cap, x, y, w=88, h=16, bold=False, color=None):
    c = ctrl(d, "Forms.Label.1", Caption=cap, Left=x, Top=y, Width=w, Height=h)
    c.TextAlign = 1  # fmTextAlignLeft
    if bold:
        try: c.Font.Bold = True
        except: pass
    if color is not None:
        try: c.ForeColor = color
        except: pass
    return c

def txt(d, name, x, y, w=140, h=18, **kw):
    h = kw.pop("Height", h)  # caller may pass Height=N as keyword
    return ctrl(d, "Forms.TextBox.1", Name=name, Left=x, Top=y, Width=w, Height=h, **kw)

def cmb(d, name, x, y, w=140, h=18):
    c = ctrl(d, "Forms.ComboBox.1", Name=name, Left=x, Top=y, Width=w, Height=h)
    c.Style = 2  # fmStyleDropDownList
    return c

def chk(d, name, cap, x, y, w=160, h=18):
    return ctrl(d, "Forms.CheckBox.1", Name=name, Caption=cap, Left=x, Top=y, Width=w, Height=h)

def sep(d, y, w):
    c = ctrl(d, "Forms.Label.1", Caption="", Left=6, Top=y, Width=w-12, Height=1)
    try: c.BackColor = 0xCCCCCC; c.BackStyle = 1
    except: pass
    return c

def section_label(d, cap, y, w, color=0x2E6DB4):
    c = ctrl(d, "Forms.Label.1", Caption=cap, Left=6, Top=y, Width=w-12, Height=18)
    c.TextAlign = 1
    try:
        c.ForeColor = color
        c.Font.Bold = True
    except:
        pass
    return c


# ─────────────────────────────────────────────────────────────────────────────
# Build each UserForm
# ─────────────────────────────────────────────────────────────────────────────


def _frm_set(uf, d, W, bg=0xF8FAFF):
    """Set form Width (via Properties) and BackColor (via designer if available)."""
    uf.Properties("Width").Value = W
    try: d.BackColor = bg
    except: pass

def _frm_height(uf, H):
    uf.Properties("Height").Value = H


def _frm_set(uf, d, W, bg=0xF8FAFF):
    uf.Properties("Width").Value = W
    try: d.BackColor = bg
    except: pass

def _frm_height(uf, H):
    uf.Properties("Height").Value = H

def build_synagogue_form(vba):
    uf = vba.VBComponents.Add(3); uf.Name = "frmSynagogue"
    d = uf.Designer
    W = 400
    d.Caption = "Add Synagogue"
    _frm_set(uf, d, W)
    Y = 8
    R = 26  # row height

    section_label(d, "בית כנסת חדש", Y, W)
    Y += 22

    lbl(d, "מזהה *", 8, Y); txt(d, "txtId", 96, Y, 110)
    lbl(d, "שם *", 220, Y); txt(d, "txtName", 270, Y, 122)
    Y += R
    lbl(d, "שכונה", 8, Y); txt(d, "txtNeighborhood", 96, Y, 110)
    lbl(d, "נוסח *", 220, Y); cmb(d, "cmbNusach", 270, Y, 122)
    Y += R
    lbl(d, "כתובת עברית", 8, Y)
    txt(d, "txtAddrHe", 96, Y, 180)
    Y += R
    lbl(d, "כתובת אנגלית", 8, Y)
    txt(d, "txtAddrEn", 96, Y, 180)
    Y += R
    sep(d, Y, W); Y += 6

    section_label(d, "צוות ורבנות", Y, W)
    Y += 22
    lbl(d, "טלפון", 8, Y); txt(d, "txtPhone", 96, Y, 110)
    Y += R
    lbl(d, "שם הרב", 8, Y); txt(d, "txtRabbiName", 96, Y, 110)
    lbl(d, "טלפון הרב", 220, Y); txt(d, "txtRabbiPhone", 270, Y, 122)
    Y += R
    lbl(d, "שם גבאי", 8, Y); txt(d, "txtGabbaiName", 96, Y, 110)
    lbl(d, "טלפון גבאי", 220, Y); txt(d, "txtGabbaiPhone", 270, Y, 122)
    Y += R
    sep(d, Y, W); Y += 6

    section_label(d, "מיקום וניווט", Y, W)
    Y += 22
    lbl(d, "קו רוחב", 8, Y); txt(d, "txtLat", 96, Y, 80)
    lbl(d, "קו אורך", 190, Y); txt(d, "txtLon", 250, Y, 80)
    Y += R
    lbl(d, "Waze", 8, Y); txt(d, "txtWaze", 96, Y, 296)
    Y += R
    lbl(d, "הערת ניווט", 8, Y)
    txt(d, "txtNavNote", 96, Y, 296)
    Y += R
    lbl(d, "הערות", 8, Y); txt(d, "txtNotes", 96, Y, 296)
    Y += R + 6

    btn_add = ctrl(d, "Forms.CommandButton.1", Name="btnAdd",
                   Caption="הוסף ✔",
                   Left=20, Top=Y, Width=90, Height=26)
    try: btn_add.BackColor = 0x2E6DB4; btn_add.ForeColor = 0xFFFFFF; btn_add.Font.Bold = True
    except: pass
    ctrl(d, "Forms.CommandButton.1", Name="btnCancel",
         Caption="ביטול",
         Left=120, Top=Y, Width=70, Height=26)
    Y += 36
    _frm_height(uf, Y + 10)
    uf.CodeModule.AddFromString(CODE_SYN)


def build_prayer_form(vba):
    uf = vba.VBComponents.Add(3); uf.Name = "frmPrayer"
    d = uf.Designer
    W = 390
    d.Caption = "Add Prayer Time"
    _frm_set(uf, d, W)
    Y = 8
    R = 26

    section_label(d, "רשומת בית כנסת וסוג תפילה", Y, W)
    Y += 22
    lbl(d, "בית כנסת *", 8, Y); cmb(d, "cmbSynId", 96, Y, 120)
    lbl(d, "תפילה *", 232, Y); cmb(d, "cmbPrayerType", 286, Y, 96)
    Y += R
    lbl(d, "סוג לוח *", 8, Y); cmb(d, "cmbScheduleType", 96, Y, 150)
    Y += R
    lbl(d, "ימים", 8, Y)
    txt(d, "txtDays", 96, Y, 150)
    lbl(d, "1,2..7 או daily", 252, Y, 130, 14, color=0x888888)
    Y += R
    sep(d, Y, W); Y += 6

    section_label(d, "שעה — קבועה או יחסית לזמנים", Y, W)
    Y += 22
    lbl(d, "שעה קבועה", 8, Y)
    txt(d, "txtTime", 96, Y, 70)
    lbl(d, "HH:MM", 172, Y, 40, 14, color=0x888888)
    Y += R
    lbl(d, "עוגן", 8, Y); cmb(d, "cmbAnchor", 96, Y, 150)
    Y += R
    lbl(d, "קיזוז (דקות)", 8, Y)
    txt(d, "txtOffset", 96, Y, 60)
    lbl(d, "-20 = 20 דק לפני  /  +20 = 20 דק אחרי", 162, Y, 200, 14, color=0x888888)
    Y += R
    sep(d, Y, W); Y += 6
    lbl(d, "הערות", 8, Y)
    txt(d, "txtNotes", 96, Y, 286)
    Y += R + 6

    btn_add = ctrl(d, "Forms.CommandButton.1", Name="btnAdd",
                   Caption="הוסף ✔",
                   Left=20, Top=Y, Width=90, Height=26)
    try: btn_add.BackColor = 0x2E6DB4; btn_add.ForeColor = 0xFFFFFF; btn_add.Font.Bold = True
    except: pass
    ctrl(d, "Forms.CommandButton.1", Name="btnCancel",
         Caption="ביטול",
         Left=120, Top=Y, Width=70, Height=26)
    Y += 36
    _frm_height(uf, Y + 10)
    uf.CodeModule.AddFromString(CODE_PRAY)


def build_restaurant_form(vba):
    uf = vba.VBComponents.Add(3); uf.Name = "frmRestaurant"
    d = uf.Designer
    W = 400
    d.Caption = "Add Restaurant"
    _frm_set(uf, d, W)
    Y = 8; R = 26

    section_label(d, "פרטי מסעדה", Y, W); Y += 22
    lbl(d, "מזהה *", 8, Y); txt(d, "txtId", 96, Y, 100)
    lbl(d, "קטגוריה *", 210, Y); cmb(d, "cmbCategory", 270, Y, 122)
    Y += R
    lbl(d, "שם *", 8, Y); txt(d, "txtName", 96, Y, 296)
    Y += R
    lbl(d, "שכונה", 8, Y); txt(d, "txtNeighborhood", 96, Y, 110)
    Y += R
    lbl(d, "כתובת *", 8, Y); txt(d, "txtAddress", 96, Y, 296)
    Y += R
    lbl(d, "טלפון", 8, Y); txt(d, "txtPhone", 96, Y, 110)
    lbl(d, "אתר", 220, Y); txt(d, "txtWebsite", 270, Y, 122)
    Y += R
    lbl(d, "קו רוחב", 8, Y); txt(d, "txtLat", 96, Y, 80)
    lbl(d, "קו אורך", 190, Y); txt(d, "txtLon", 250, Y, 80)
    Y += R; sep(d, Y, W); Y += 6

    section_label(d, "שעות פתיחה (HH:MM-HH:MM או סגור)", Y, W); Y += 22
    days_he = ["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"]
    names   = ["txtSun","txtMon","txtTue","txtWed","txtThu","txtFri","txtSat"]
    for i in range(0, 7, 2):
        x1 = 8; lbl(d, days_he[i], x1, Y, 50)
        txt(d, names[i], x1+52, Y, 80)
        if i+1 < 7:
            x2 = 200; lbl(d, days_he[i+1], x2, Y, 50)
            txt(d, names[i+1], x2+52, Y, 80)
        Y += R
    sep(d, Y, W); Y += 6

    section_label(d, "תעודת כשרות", Y, W); Y += 22
    lbl(d, "גוף מכשיר", 8, Y); txt(d, "txtKosherBy", 96, Y, 150)
    lbl(d, "מס' תעודה", 260, Y, 60); txt(d, "txtCertNum", 310, Y, 82)
    Y += R
    lbl(d, "רמת כשרות", 8, Y)
    txt(d, "txtKosherLevel", 96, Y, 296)
    lbl(d, "mehadrin,glatt,…", 8, Y+14, 280, 12, color=0x888888)
    Y += R+4
    lbl(d, "תוקף מ", 8, Y); txt(d, "txtValidFrom", 96, Y, 100)
    lbl(d, "תוקף עד", 210, Y); txt(d, "txtValidUntil", 270, Y, 100)
    Y += R
    lbl(d, "הערות כשרות", 8, Y); txt(d, "txtKosherNotes", 96, Y, 296)
    Y += R + 6

    btn_add = ctrl(d, "Forms.CommandButton.1", Name="btnAdd",
                   Caption="הוסף ✔",
                   Left=20, Top=Y, Width=90, Height=26)
    try: btn_add.BackColor = 0x2E6DB4; btn_add.ForeColor = 0xFFFFFF; btn_add.Font.Bold = True
    except: pass
    ctrl(d, "Forms.CommandButton.1", Name="btnCancel",
         Caption="ביטול", Left=120, Top=Y, Width=70, Height=26)
    Y += 36
    _frm_height(uf, Y + 10)
    uf.CodeModule.AddFromString(CODE_REST)


def build_mikveh_form(vba):
    uf = vba.VBComponents.Add(3); uf.Name = "frmMikveh"
    d = uf.Designer
    W = 380
    d.Caption = "Add Mikveh"
    _frm_set(uf, d, W)
    Y = 8; R = 26

    section_label(d, "פרטי מקווה", Y, W); Y += 22
    lbl(d, "מזהה *", 8, Y); txt(d, "txtId", 96, Y, 100)
    lbl(d, "סוג *", 210, Y); cmb(d, "cmbType", 250, Y, 122)
    Y += R
    lbl(d, "שם *", 8, Y); txt(d, "txtName", 96, Y, 276)
    Y += R
    lbl(d, "שכונה", 8, Y); txt(d, "txtNeighborhood", 96, Y, 100)
    Y += R
    lbl(d, "כתובת *", 8, Y); txt(d, "txtAddress", 96, Y, 276)
    Y += R
    lbl(d, "טלפון", 8, Y); txt(d, "txtPhone", 96, Y, 100)
    lbl(d, "קו רוחב", 210, Y); txt(d, "txtLat", 256, Y, 60)
    Y += R
    lbl(d, "קו אורך", 8, Y); txt(d, "txtLon", 96, Y, 60)
    chk(d, "chkAppt", "דרושה הזמנה", 175, Y)
    Y += R
    lbl(d, "טלפון הזמנות", 8, Y); txt(d, "txtApptPhone", 96, Y, 100)
    Y += R
    lbl(d, "הערות", 8, Y); txt(d, "txtNotes", 96, Y, 276)
    Y += R; sep(d, Y, W); Y += 6

    section_label(d, "שעות פתיחה", Y, W); Y += 22
    days_he = ["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"]
    names   = ["txtSun","txtMon","txtTue","txtWed","txtThu","txtFri","txtSat"]
    for i in range(0, 7, 2):
        lbl(d, days_he[i], 8, Y, 50); txt(d, names[i], 60, Y, 80)
        if i+1 < 7:
            lbl(d, days_he[i+1], 158, Y, 50); txt(d, names[i+1], 210, Y, 80)
        Y += R

    btn_add = ctrl(d, "Forms.CommandButton.1", Name="btnAdd",
                   Caption="הוסף ✔",
                   Left=20, Top=Y+4, Width=90, Height=26)
    try: btn_add.BackColor = 0x2E6DB4; btn_add.ForeColor = 0xFFFFFF; btn_add.Font.Bold = True
    except: pass
    ctrl(d, "Forms.CommandButton.1", Name="btnCancel",
         Caption="ביטול", Left=120, Top=Y+4, Width=70, Height=26)
    _frm_height(uf, Y + 44)
    uf.CodeModule.AddFromString(CODE_MIK)


def build_event_form(vba):
    uf = vba.VBComponents.Add(3); uf.Name = "frmEvent"
    d = uf.Designer
    W = 380
    d.Caption = "Add Event"
    _frm_set(uf, d, W)
    Y = 8; R = 26

    section_label(d, "פרטי אירוע", Y, W); Y += 22
    lbl(d, "מזהה *", 8, Y); txt(d, "txtId", 96, Y, 100)
    lbl(d, "קטגוריה", 214, Y); cmb(d, "cmbCategory", 270, Y, 102)
    Y += R
    lbl(d, "כותרת *", 8, Y); txt(d, "txtTitle", 96, Y, 276)
    Y += R
    lbl(d, "תיאור", 8, Y); txt(d, "txtDesc", 96, Y, 276, MultiLine=True, Height=40)
    Y += 46
    lbl(d, "תאריך התחלה *", 8, Y)
    txt(d, "txtStartDate", 96, Y, 130)
    lbl(d, "YYYY-MM-DD HH:MM", 230, Y, 130, 14, color=0x888888)
    Y += R
    lbl(d, "תאריך סיום", 8, Y); txt(d, "txtEndDate", 96, Y, 130)
    Y += R
    lbl(d, "מיקום", 8, Y); txt(d, "txtLocation", 96, Y, 130)
    lbl(d, "מארגן", 240, Y); txt(d, "txtOrganizer", 280, Y, 92)
    Y += R
    chk(d, "chkAlert", "התראה דחופה (יוצג במסך הבית)", 8, Y, 250)
    Y += R + 6

    btn_add = ctrl(d, "Forms.CommandButton.1", Name="btnAdd",
                   Caption="הוסף ✔",
                   Left=20, Top=Y, Width=90, Height=26)
    try: btn_add.BackColor = 0x2E6DB4; btn_add.ForeColor = 0xFFFFFF; btn_add.Font.Bold = True
    except: pass
    ctrl(d, "Forms.CommandButton.1", Name="btnCancel",
         Caption="ביטול", Left=120, Top=Y, Width=70, Height=26)
    _frm_height(uf, Y + 44)
    uf.CodeModule.AddFromString(CODE_EVT)


def build_shiur_form(vba):
    uf = vba.VBComponents.Add(3); uf.Name = "frmShiur"
    d = uf.Designer
    W = 370
    d.Caption = "Add Shiur"
    _frm_set(uf, d, W)
    Y = 8; R = 26

    section_label(d, "פרטי שיעור", Y, W); Y += 22
    lbl(d, "בית כנסת *", 8, Y); cmb(d, "cmbSynId", 96, Y, 130)
    lbl(d, "מזהה שיעור *", 240, Y, 80); txt(d, "txtShiurId", 310, Y, 52)
    Y += R
    lbl(d, "שם שיעור *", 8, Y); txt(d, "txtTitle", 96, Y, 266)
    Y += R
    lbl(d, "מרצה / רב", 8, Y); txt(d, "txtRabbi", 96, Y, 266)
    Y += R
    lbl(d, "ימים", 8, Y); txt(d, "txtDays", 96, Y, 120)
    lbl(d, "1,2..7 / daily", 222, Y, 90, 14, color=0x888888)
    Y += R
    lbl(d, "שעה (HH:MM)", 8, Y); txt(d, "txtTime", 96, Y, 80)
    Y += R
    lbl(d, "תיאור", 8, Y); txt(d, "txtDesc", 96, Y, 266)
    Y += R + 6

    btn_add = ctrl(d, "Forms.CommandButton.1", Name="btnAdd",
                   Caption="הוסף ✔",
                   Left=20, Top=Y, Width=90, Height=26)
    try: btn_add.BackColor = 0x2E6DB4; btn_add.ForeColor = 0xFFFFFF; btn_add.Font.Bold = True
    except: pass
    ctrl(d, "Forms.CommandButton.1", Name="btnCancel",
         Caption="ביטול", Left=120, Top=Y, Width=70, Height=26)
    _frm_height(uf, Y + 44)
    uf.CodeModule.AddFromString(CODE_SHI)


# ─────────────────────────────────────────────────────────────────────────────
# Add "➕" button shapes to data sheets
# ─────────────────────────────────────────────────────────────────────────────

SHEET_BUTTONS = {
    "בתי_כנסת":            "AddSynagogue",
    "תפילות_מפורטות": "AddPrayer",
    "מסעדות_כשרות":             "AddRestaurant",
    "מקוואות":                   "AddMikveh",
    "אירועים_ושיעורים": "AddEvent",
    "שיעורים_קבועים": "AddShiur",
}


def add_buttons(wb_com):
    for sheet_name, macro_name in SHEET_BUTTONS.items():
        try:
            ws = wb_com.Sheets(sheet_name)
        except Exception:
            print(f"  [warn] sheet not found: {sheet_name}")
            continue
        shp = ws.Shapes.AddShape(1, 4, 4, 90, 22)  # msoShapeRectangle
        shp.TextFrame.Characters().Text = "הוסף ➕"
        try:
            shp.TextFrame.Characters().Font.Name = "Arial"
            shp.TextFrame.Characters().Font.Size = 10
            shp.TextFrame.Characters().Font.Bold = True
            shp.TextFrame.Characters().Font.Color = 0xFFFFFF
            shp.Fill.ForeColor.RGB = 0x2E6DB4
            shp.Line.Visible = False
            shp.TextFrame.HorizontalAlignment = 2  # xlHAlignCenter
        except Exception:
            pass
        shp.OnAction = macro_name
        print(f"  Button added: {sheet_name}")


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main():
    src  = os.path.abspath(r"C:\Temp\kehila_base.xlsx")
    dest = os.path.abspath(r"C:\Temp\kehila_data_template.xlsm")

    xl = win32.DispatchEx("Excel.Application")
    xl.Visible = False
    xl.DisplayAlerts = False
    xl.AutomationSecurity = 1   # msoAutomationSecurityLow

    try:
        wb = xl.Workbooks.Open(src)

        # Trust access to VBA Object Model is required; try anyway
        try:
            vba = wb.VBProject
        except Exception as e:
            print("ERROR: Cannot access VBA Project.")
            print("In Excel: File → Options → Trust Center → Trust Center Settings → Macro Settings")
            print('Enable "Trust access to the VBA project object model"')
            wb.Close(False)
            xl.Quit()
            return

        # ── Add main module ──────────────────────────────────────────────────
        mod = vba.VBComponents.Add(1)   # vbext_ct_StdModule
        mod.Name = "KehilaForms"
        mod.CodeModule.AddFromString(MAIN_MOD)

        # ── Add UserForms ────────────────────────────────────────────────────
        print("Building forms...")
        build_synagogue_form(vba)
        build_prayer_form(vba)
        build_restaurant_form(vba)
        build_mikveh_form(vba)
        build_event_form(vba)
        build_shiur_form(vba)

        # ── Add + buttons ────────────────────────────────────────────────────
        print("Adding buttons...")
        add_buttons(wb)

        # ── Save as .xlsm ────────────────────────────────────────────────────
        wb.SaveAs(dest, FileFormat=XL_FMT_XLSM)
        wb.Close(False)
        print(f"Saved: {dest}")

    except Exception as e:
        import traceback
        traceback.print_exc()
    finally:
        try:
            xl.Quit()
        except:
            pass

if __name__ == "__main__":
    main()
