# add_vba_ps.ps1 — Build kehila_data_template.xlsm with VBA UserForms via PowerShell COM
# PowerShell can access VBProject where MS-Store Python cannot (sandbox registry isolation)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# ─── VBA code strings ────────────────────────────────────────────────────────

$MAIN_MOD = @'
Option Explicit

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

Sub AddSynagogue()     : frmSynagogue.Show : End Sub
Sub AddPrayer()        : frmPrayer.Show    : End Sub
Sub AddRestaurant()    : frmRestaurant.Show: End Sub
Sub AddMikveh()        : frmMikveh.Show    : End Sub
Sub AddEvent()         : frmEvent.Show     : End Sub
Sub AddShiur()         : frmShiur.Show     : End Sub
'@

$CODE_SYN = @'
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
'@

$CODE_PRAY = @'
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
'@

$CODE_REST = @'
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
'@

$CODE_MIK = @'
Private Sub UserForm_Initialize()
    cmbType.AddItem "women"
    cmbType.AddItem "men"
    cmbType.AddItem "both"
    cmbType.ListIndex = 0
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Sheets(ChrW(1502) & ChrW(1511) & ChrW(1493) & ChrW(1488) & ChrW(1493) & ChrW(1514))
    On Error GoTo 0
    If Not ws Is Nothing Then txtId.Value = NextId(ws, "mik-")
End Sub

Private Sub btnAdd_Click()
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Sheets(ChrW(1502) & ChrW(1511) & ChrW(1493) & ChrW(1488) & ChrW(1493) & ChrW(1514))
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
'@

$CODE_EVT = @'
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
'@

$CODE_SHI = @'
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
'@

# ─── Form control helpers ─────────────────────────────────────────────────────

function Add-Ctrl($d, $progId, $name, $x, $y, $w, $h) {
    $c = $d.Controls.Add($progId)
    if ($name) { try { $c.Name = $name } catch {} }
    $c.Left = $x; $c.Top = $y; $c.Width = $w; $c.Height = $h
    try { $c.Font.Name = "Arial"; $c.Font.Size = 9 } catch {}
    return $c
}

function Add-Lbl($d, $cap, $x, $y, $w=88, $h=16, $bold=$false, $color=-1) {
    $c = Add-Ctrl $d "Forms.Label.1" $null $x $y $w $h
    $c.Caption = $cap; $c.TextAlign = 1
    if ($bold) { try { $c.Font.Bold = $true } catch {} }
    if ($color -ge 0) { try { $c.ForeColor = $color } catch {} }
    return $c
}

function Add-Txt($d, $name, $x, $y, $w=140, $h=18) {
    return Add-Ctrl $d "Forms.TextBox.1" $name $x $y $w $h
}

function Add-Cmb($d, $name, $x, $y, $w=140, $h=18) {
    $c = Add-Ctrl $d "Forms.ComboBox.1" $name $x $y $w $h
    $c.Style = 2  # fmStyleDropDownList
    return $c
}

function Add-Chk($d, $name, $cap, $x, $y, $w=160, $h=18) {
    $c = Add-Ctrl $d "Forms.CheckBox.1" $name $x $y $w $h
    $c.Caption = $cap
    return $c
}

function Add-Sep($d, $y, $w) {
    $c = Add-Ctrl $d "Forms.Label.1" $null 6 $y ($w-12) 1
    $c.Caption = ""
    try { $c.BackColor = 0xCCCCCC; $c.BackStyle = 1 } catch {}
}

function Add-SectionLabel($d, $cap, $y, $w, $color=0x2E6DB4) {
    $c = Add-Ctrl $d "Forms.Label.1" $null 6 $y ($w-12) 18
    $c.Caption = $cap; $c.TextAlign = 1
    try { $c.ForeColor = $color; $c.Font.Bold = $true } catch {}
}

function Add-Btn($d, $name, $cap, $x, $y, $w, $h, $primary=$false) {
    $c = Add-Ctrl $d "Forms.CommandButton.1" $name $x $y $w $h
    $c.Caption = $cap
    if ($primary) {
        try { $c.BackColor = 0x2E6DB4; $c.ForeColor = 0xFFFFFF; $c.Font.Bold = $true } catch {}
    }
    return $c
}

# ─── Build each UserForm ──────────────────────────────────────────────────────

function Build-SynagogueForm($vba) {
    $uf = $vba.VBComponents.Add(3); $uf.Name = "frmSynagogue"
    $d = $uf.Designer
    $W = 400; $d.Caption = "Add Synagogue"; $d.Width = $W; try { $d.BackColor = 0xF8FAFF } catch {}
    $Y = 8; $R = 26

    Add-SectionLabel $d ([char]0x05D1 + [char]0x05D9 + [char]0x05EA + " " + [char]0x05DB + [char]0x05E0 + [char]0x05E1 + [char]0x05EA + " " + [char]0x05D7 + [char]0x05D3 + [char]0x05E9) $Y $W
    $Y += 22

    Add-Lbl $d ([char]0x05DE + [char]0x05D6 + [char]0x05D4 + [char]0x05D4 + " *") 8 $Y; Add-Txt $d "txtId" 96 $Y 110
    Add-Lbl $d ([char]0x05E9 + [char]0x05DD + " *") 220 $Y; Add-Txt $d "txtName" 270 $Y 122
    $Y += $R
    Add-Lbl $d ([char]0x05E9 + [char]0x05DB + [char]0x05D5 + [char]0x05E0 + [char]0x05D4) 8 $Y; Add-Txt $d "txtNeighborhood" 96 $Y 110
    Add-Lbl $d ([char]0x05E0 + [char]0x05D5 + [char]0x05E1 + [char]0x05D7 + " *") 220 $Y; Add-Cmb $d "cmbNusach" 270 $Y 122
    $Y += $R
    Add-Lbl $d ([char]0x05DB + [char]0x05EA + [char]0x05D5 + [char]0x05D1 + [char]0x05EA + " " + [char]0x05E2 + [char]0x05D1 + [char]0x05E8 + [char]0x05D9 + [char]0x05EA) 8 $Y
    Add-Txt $d "txtAddrHe" 96 $Y 180
    $Y += $R
    Add-Lbl $d ([char]0x05DB + [char]0x05EA + [char]0x05D5 + [char]0x05D1 + [char]0x05EA + " " + [char]0x05D0 + [char]0x05E0 + [char]0x05D2 + [char]0x05DC + [char]0x05D9 + [char]0x05EA) 8 $Y
    Add-Txt $d "txtAddrEn" 96 $Y 180
    $Y += $R
    Add-Sep $d $Y $W; $Y += 6

    Add-SectionLabel $d ([char]0x05E6 + [char]0x05D5 + [char]0x05D5 + [char]0x05EA + " " + [char]0x05D5 + [char]0x05E8 + [char]0x05D1 + [char]0x05E0 + [char]0x05D5 + [char]0x05EA) $Y $W
    $Y += 22
    Add-Lbl $d ([char]0x05D8 + [char]0x05DC + [char]0x05E4 + [char]0x05D5 + [char]0x05DF) 8 $Y; Add-Txt $d "txtPhone" 96 $Y 110
    $Y += $R
    Add-Lbl $d ([char]0x05E9 + [char]0x05DD + " " + [char]0x05D4 + [char]0x05E8 + [char]0x05D1) 8 $Y; Add-Txt $d "txtRabbiName" 96 $Y 110
    Add-Lbl $d ([char]0x05D8 + [char]0x05DC + [char]0x05E4 + [char]0x05D5 + [char]0x05DF + " " + [char]0x05D4 + [char]0x05E8 + [char]0x05D1) 220 $Y; Add-Txt $d "txtRabbiPhone" 270 $Y 122
    $Y += $R
    Add-Lbl $d ([char]0x05E9 + [char]0x05DD + " " + [char]0x05D2 + [char]0x05D1 + [char]0x05D0 + [char]0x05D9) 8 $Y; Add-Txt $d "txtGabbaiName" 96 $Y 110
    Add-Lbl $d ([char]0x05D8 + [char]0x05DC + [char]0x05E4 + [char]0x05D5 + [char]0x05DF + " " + [char]0x05D2 + [char]0x05D1 + [char]0x05D0 + [char]0x05D9) 220 $Y; Add-Txt $d "txtGabbaiPhone" 270 $Y 122
    $Y += $R
    Add-Sep $d $Y $W; $Y += 6

    Add-SectionLabel $d ([char]0x05DE + [char]0x05D9 + [char]0x05E7 + [char]0x05D5 + [char]0x05DD + " " + [char]0x05D5 + [char]0x05E0 + [char]0x05D9 + [char]0x05D5 + [char]0x05D5 + [char]0x05D8) $Y $W
    $Y += 22
    Add-Lbl $d ([char]0x05E7 + [char]0x05D5 + " " + [char]0x05E8 + [char]0x05D5 + [char]0x05D7 + [char]0x05D1) 8 $Y; Add-Txt $d "txtLat" 96 $Y 80
    Add-Lbl $d ([char]0x05E7 + [char]0x05D5 + " " + [char]0x05D0 + [char]0x05D5 + [char]0x05E8 + [char]0x05DA) 190 $Y; Add-Txt $d "txtLon" 250 $Y 80
    $Y += $R
    Add-Lbl $d "Waze" 8 $Y; Add-Txt $d "txtWaze" 96 $Y 296
    $Y += $R
    Add-Lbl $d ([char]0x05D4 + [char]0x05E2 + [char]0x05E8 + [char]0x05EA + " " + [char]0x05E0 + [char]0x05D9 + [char]0x05D5 + [char]0x05D5 + [char]0x05D8) 8 $Y; Add-Txt $d "txtNavNote" 96 $Y 296
    $Y += $R
    Add-Lbl $d ([char]0x05D4 + [char]0x05E2 + [char]0x05E8 + [char]0x05D5 + [char]0x05EA) 8 $Y; Add-Txt $d "txtNotes" 96 $Y 296
    $Y += $R + 6

    Add-Btn $d "btnAdd" ([char]0x05D4 + [char]0x05D5 + [char]0x05E1 + [char]0x05E3 + " " + [char]0x2714) 20 $Y 90 26 $true
    Add-Btn $d "btnCancel" ([char]0x05D1 + [char]0x05D9 + [char]0x05D8 + [char]0x05D5 + [char]0x05DC) 120 $Y 70 26
    $Y += 36
    $d.Height = $Y + 10
    $uf.CodeModule.AddFromString($CODE_SYN)
    Write-Host "  frmSynagogue built"
}

function Build-PrayerForm($vba) {
    $uf = $vba.VBComponents.Add(3); $uf.Name = "frmPrayer"
    $d = $uf.Designer
    $W = 390; $d.Caption = "Add Prayer Time"; $d.Width = $W; try { $d.BackColor = 0xF8FAFF } catch {}
    $Y = 8; $R = 26

    Add-SectionLabel $d ([char]0x05E8 + [char]0x05E9 + [char]0x05D5 + [char]0x05DE + [char]0x05EA + " " + [char]0x05D1 + [char]0x05D9 + [char]0x05EA + " " + [char]0x05DB + [char]0x05E0 + [char]0x05E1 + [char]0x05EA + " " + [char]0x05D5 + [char]0x05E1 + [char]0x05D5 + [char]0x05D2 + " " + [char]0x05EA + [char]0x05E4 + [char]0x05D9 + [char]0x05DC + [char]0x05D4) $Y $W
    $Y += 22
    Add-Lbl $d ([char]0x05D1 + [char]0x05D9 + [char]0x05EA + " " + [char]0x05DB + [char]0x05E0 + [char]0x05E1 + [char]0x05EA + " *") 8 $Y; Add-Cmb $d "cmbSynId" 96 $Y 120
    Add-Lbl $d ([char]0x05EA + [char]0x05E4 + [char]0x05D9 + [char]0x05DC + [char]0x05D4 + " *") 232 $Y; Add-Cmb $d "cmbPrayerType" 286 $Y 96
    $Y += $R
    Add-Lbl $d ([char]0x05E1 + [char]0x05D5 + [char]0x05D2 + " " + [char]0x05DC + [char]0x05D5 + [char]0x05D7 + " *") 8 $Y; Add-Cmb $d "cmbScheduleType" 96 $Y 150
    $Y += $R
    Add-Lbl $d ([char]0x05D9 + [char]0x05DE + [char]0x05D9 + [char]0x05DD) 8 $Y; Add-Txt $d "txtDays" 96 $Y 150
    Add-Lbl $d "1,2..7" 252 $Y 130 14 $false 0x888888
    $Y += $R
    Add-Sep $d $Y $W; $Y += 6

    Add-SectionLabel $d ([char]0x05E9 + [char]0x05E2 + [char]0x05D4 + " " + [char]0x2014 + " " + [char]0x05E7 + [char]0x05D1 + [char]0x05D5 + [char]0x05E2 + [char]0x05D4 + " " + [char]0x05D0 + [char]0x05D5 + " " + [char]0x05D9 + [char]0x05D7 + [char]0x05E1 + [char]0x05D9 + [char]0x05EA + " " + [char]0x05DC + [char]0x05D6 + [char]0x05DE + [char]0x05E0 + [char]0x05D9 + [char]0x05DD) $Y $W
    $Y += 22
    Add-Lbl $d ([char]0x05E9 + [char]0x05E2 + [char]0x05D4 + " " + [char]0x05E7 + [char]0x05D1 + [char]0x05D5 + [char]0x05E2 + [char]0x05D4) 8 $Y; Add-Txt $d "txtTime" 96 $Y 70
    Add-Lbl $d "HH:MM" 172 $Y 40 14 $false 0x888888
    $Y += $R
    Add-Lbl $d ([char]0x05E2 + [char]0x05D5 + [char]0x05D2 + [char]0x05DF) 8 $Y; Add-Cmb $d "cmbAnchor" 96 $Y 150
    $Y += $R
    Add-Lbl $d ([char]0x05E7 + [char]0x05D9 + [char]0x05D6 + [char]0x05D5 + [char]0x05D6 + " (" + [char]0x05D3 + [char]0x05E7 + [char]0x05D5 + [char]0x05EA + ")") 8 $Y; Add-Txt $d "txtOffset" 96 $Y 60
    Add-Lbl $d "-20 = 20min before" 162 $Y 200 14 $false 0x888888
    $Y += $R
    Add-Sep $d $Y $W; $Y += 6
    Add-Lbl $d ([char]0x05D4 + [char]0x05E2 + [char]0x05E8 + [char]0x05D5 + [char]0x05EA) 8 $Y; Add-Txt $d "txtNotes" 96 $Y 286
    $Y += $R + 6

    Add-Btn $d "btnAdd" ([char]0x05D4 + [char]0x05D5 + [char]0x05E1 + [char]0x05E3 + " " + [char]0x2714) 20 $Y 90 26 $true
    Add-Btn $d "btnCancel" ([char]0x05D1 + [char]0x05D9 + [char]0x05D8 + [char]0x05D5 + [char]0x05DC) 120 $Y 70 26
    $Y += 36
    $d.Height = $Y + 10
    $uf.CodeModule.AddFromString($CODE_PRAY)
    Write-Host "  frmPrayer built"
}

function Build-RestaurantForm($vba) {
    $uf = $vba.VBComponents.Add(3); $uf.Name = "frmRestaurant"
    $d = $uf.Designer
    $W = 400; $d.Caption = "Add Restaurant"; $d.Width = $W; try { $d.BackColor = 0xF8FAFF } catch {}
    $Y = 8; $R = 26

    Add-SectionLabel $d ([char]0x05E4 + [char]0x05E8 + [char]0x05D8 + [char]0x05D9 + " " + [char]0x05DE + [char]0x05E1 + [char]0x05E2 + [char]0x05D3 + [char]0x05D4) $Y $W; $Y += 22
    Add-Lbl $d ([char]0x05DE + [char]0x05D6 + [char]0x05D4 + [char]0x05D4 + " *") 8 $Y; Add-Txt $d "txtId" 96 $Y 100
    Add-Lbl $d ([char]0x05E7 + [char]0x05D8 + [char]0x05D2 + [char]0x05D5 + [char]0x05E8 + [char]0x05D9 + [char]0x05D4 + " *") 210 $Y; Add-Cmb $d "cmbCategory" 270 $Y 122
    $Y += $R
    Add-Lbl $d ([char]0x05E9 + [char]0x05DD + " *") 8 $Y; Add-Txt $d "txtName" 96 $Y 296
    $Y += $R
    Add-Lbl $d ([char]0x05E9 + [char]0x05DB + [char]0x05D5 + [char]0x05E0 + [char]0x05D4) 8 $Y; Add-Txt $d "txtNeighborhood" 96 $Y 110
    $Y += $R
    Add-Lbl $d ([char]0x05DB + [char]0x05EA + [char]0x05D5 + [char]0x05D1 + [char]0x05EA + " *") 8 $Y; Add-Txt $d "txtAddress" 96 $Y 296
    $Y += $R
    Add-Lbl $d ([char]0x05D8 + [char]0x05DC + [char]0x05E4 + [char]0x05D5 + [char]0x05DF) 8 $Y; Add-Txt $d "txtPhone" 96 $Y 110
    Add-Lbl $d ([char]0x05D0 + [char]0x05EA + [char]0x05E8) 220 $Y; Add-Txt $d "txtWebsite" 270 $Y 122
    $Y += $R
    Add-Lbl $d ([char]0x05E7 + [char]0x05D5 + " " + [char]0x05E8 + [char]0x05D5 + [char]0x05D7 + [char]0x05D1) 8 $Y; Add-Txt $d "txtLat" 96 $Y 80
    Add-Lbl $d ([char]0x05E7 + [char]0x05D5 + " " + [char]0x05D0 + [char]0x05D5 + [char]0x05E8 + [char]0x05DA) 190 $Y; Add-Txt $d "txtLon" 250 $Y 80
    $Y += $R; Add-Sep $d $Y $W; $Y += 6

    Add-SectionLabel $d ([char]0x05E9 + [char]0x05E2 + [char]0x05D5 + [char]0x05EA + " " + [char]0x05E4 + [char]0x05EA + [char]0x05D9 + [char]0x05D7 + [char]0x05D4) $Y $W; $Y += 22
    $daysHe = @([char]0x05E8 + [char]0x05D0 + [char]0x05E9 + [char]0x05D5 + [char]0x05DF,
                [char]0x05E9 + [char]0x05E0 + [char]0x05D9,
                [char]0x05E9 + [char]0x05DC + [char]0x05D9 + [char]0x05E9 + [char]0x05D9,
                [char]0x05E8 + [char]0x05D1 + [char]0x05D9 + [char]0x05E2 + [char]0x05D9,
                [char]0x05D7 + [char]0x05DE + [char]0x05D9 + [char]0x05E9 + [char]0x05D9,
                [char]0x05E9 + [char]0x05D9 + [char]0x05E9 + [char]0x05D9,
                [char]0x05E9 + [char]0x05D1 + [char]0x05EA)
    $names = @("txtSun","txtMon","txtTue","txtWed","txtThu","txtFri","txtSat")
    for ($i = 0; $i -lt 7; $i += 2) {
        Add-Lbl $d $daysHe[$i] 8 $Y 50; Add-Txt $d $names[$i] 60 $Y 80
        if ($i+1 -lt 7) { Add-Lbl $d $daysHe[$i+1] 155 $Y 50; Add-Txt $d $names[$i+1] 207 $Y 80 }
        $Y += $R
    }
    Add-Sep $d $Y $W; $Y += 6

    Add-SectionLabel $d ([char]0x05EA + [char]0x05E2 + [char]0x05D5 + [char]0x05D3 + [char]0x05EA + " " + [char]0x05DB + [char]0x05E9 + [char]0x05E8 + [char]0x05D5 + [char]0x05EA) $Y $W; $Y += 22
    Add-Lbl $d ([char]0x05D2 + [char]0x05D5 + [char]0x05E3 + " " + [char]0x05DE + [char]0x05DB + [char]0x05E9 + [char]0x05D9 + [char]0x05E8) 8 $Y; Add-Txt $d "txtKosherBy" 96 $Y 150
    Add-Lbl $d ([char]0x05DE + [char]0x05E1 + "' " + [char]0x05EA + [char]0x05E2 + [char]0x05D5 + [char]0x05D3 + [char]0x05D4) 260 $Y 60; Add-Txt $d "txtCertNum" 322 $Y 70
    $Y += $R
    Add-Lbl $d ([char]0x05E8 + [char]0x05DE + [char]0x05EA + " " + [char]0x05DB + [char]0x05E9 + [char]0x05E8 + [char]0x05D5 + [char]0x05EA) 8 $Y; Add-Txt $d "txtKosherLevel" 96 $Y 296
    $Y += $R
    Add-Lbl $d ([char]0x05EA + [char]0x05D5 + [char]0x05E7 + [char]0x05E3 + " " + [char]0x05DE) 8 $Y; Add-Txt $d "txtValidFrom" 96 $Y 100
    Add-Lbl $d ([char]0x05EA + [char]0x05D5 + [char]0x05E7 + [char]0x05E3 + " " + [char]0x05E2 + [char]0x05D3) 210 $Y; Add-Txt $d "txtValidUntil" 270 $Y 100
    $Y += $R
    Add-Lbl $d ([char]0x05D4 + [char]0x05E2 + [char]0x05E8 + [char]0x05D5 + [char]0x05EA + " " + [char]0x05DB + [char]0x05E9 + [char]0x05E8 + [char]0x05D5 + [char]0x05EA) 8 $Y; Add-Txt $d "txtKosherNotes" 96 $Y 296
    $Y += $R + 6

    Add-Btn $d "btnAdd" ([char]0x05D4 + [char]0x05D5 + [char]0x05E1 + [char]0x05E3 + " " + [char]0x2714) 20 $Y 90 26 $true
    Add-Btn $d "btnCancel" ([char]0x05D1 + [char]0x05D9 + [char]0x05D8 + [char]0x05D5 + [char]0x05DC) 120 $Y 70 26
    $Y += 36; $d.Height = $Y + 10
    $uf.CodeModule.AddFromString($CODE_REST)
    Write-Host "  frmRestaurant built"
}

function Build-MikvehForm($vba) {
    $uf = $vba.VBComponents.Add(3); $uf.Name = "frmMikveh"
    $d = $uf.Designer
    $W = 380; $d.Caption = "Add Mikveh"; $d.Width = $W; try { $d.BackColor = 0xF8FAFF } catch {}
    $Y = 8; $R = 26

    Add-SectionLabel $d ([char]0x05E4 + [char]0x05E8 + [char]0x05D8 + [char]0x05D9 + " " + [char]0x05DE + [char]0x05E7 + [char]0x05D5 + [char]0x05D5 + [char]0x05D4) $Y $W; $Y += 22
    Add-Lbl $d ([char]0x05DE + [char]0x05D6 + [char]0x05D4 + [char]0x05D4 + " *") 8 $Y; Add-Txt $d "txtId" 96 $Y 100
    Add-Lbl $d ([char]0x05E1 + [char]0x05D5 + [char]0x05D2 + " *") 210 $Y; Add-Cmb $d "cmbType" 250 $Y 122
    $Y += $R
    Add-Lbl $d ([char]0x05E9 + [char]0x05DD + " *") 8 $Y; Add-Txt $d "txtName" 96 $Y 276
    $Y += $R
    Add-Lbl $d ([char]0x05E9 + [char]0x05DB + [char]0x05D5 + [char]0x05E0 + [char]0x05D4) 8 $Y; Add-Txt $d "txtNeighborhood" 96 $Y 100
    $Y += $R
    Add-Lbl $d ([char]0x05DB + [char]0x05EA + [char]0x05D5 + [char]0x05D1 + [char]0x05EA + " *") 8 $Y; Add-Txt $d "txtAddress" 96 $Y 276
    $Y += $R
    Add-Lbl $d ([char]0x05D8 + [char]0x05DC + [char]0x05E4 + [char]0x05D5 + [char]0x05DF) 8 $Y; Add-Txt $d "txtPhone" 96 $Y 100
    Add-Lbl $d ([char]0x05E7 + [char]0x05D5 + " " + [char]0x05E8 + [char]0x05D5 + [char]0x05D7 + [char]0x05D1) 210 $Y; Add-Txt $d "txtLat" 256 $Y 60
    $Y += $R
    Add-Lbl $d ([char]0x05E7 + [char]0x05D5 + " " + [char]0x05D0 + [char]0x05D5 + [char]0x05E8 + [char]0x05DA) 8 $Y; Add-Txt $d "txtLon" 96 $Y 60
    Add-Chk $d "chkAppt" ([char]0x05D3 + [char]0x05E8 + [char]0x05D5 + [char]0x05E9 + [char]0x05D4 + " " + [char]0x05D4 + [char]0x05D6 + [char]0x05DE + [char]0x05E0 + [char]0x05D4) 175 $Y
    $Y += $R
    Add-Lbl $d ([char]0x05D8 + [char]0x05DC + [char]0x05E4 + [char]0x05D5 + [char]0x05DF + " " + [char]0x05D4 + [char]0x05D6 + [char]0x05DE + [char]0x05E0 + [char]0x05D5 + [char]0x05EA) 8 $Y; Add-Txt $d "txtApptPhone" 96 $Y 100
    $Y += $R
    Add-Lbl $d ([char]0x05D4 + [char]0x05E2 + [char]0x05E8 + [char]0x05D5 + [char]0x05EA) 8 $Y; Add-Txt $d "txtNotes" 96 $Y 276
    $Y += $R; Add-Sep $d $Y $W; $Y += 6

    Add-SectionLabel $d ([char]0x05E9 + [char]0x05E2 + [char]0x05D5 + [char]0x05EA + " " + [char]0x05E4 + [char]0x05EA + [char]0x05D9 + [char]0x05D7 + [char]0x05D4) $Y $W; $Y += 22
    $daysHe = @([char]0x05E8 + [char]0x05D0 + [char]0x05E9 + [char]0x05D5 + [char]0x05DF,
                [char]0x05E9 + [char]0x05E0 + [char]0x05D9,
                [char]0x05E9 + [char]0x05DC + [char]0x05D9 + [char]0x05E9 + [char]0x05D9,
                [char]0x05E8 + [char]0x05D1 + [char]0x05D9 + [char]0x05E2 + [char]0x05D9,
                [char]0x05D7 + [char]0x05DE + [char]0x05D9 + [char]0x05E9 + [char]0x05D9,
                [char]0x05E9 + [char]0x05D9 + [char]0x05E9 + [char]0x05D9,
                [char]0x05E9 + [char]0x05D1 + [char]0x05EA)
    $names = @("txtSun","txtMon","txtTue","txtWed","txtThu","txtFri","txtSat")
    for ($i = 0; $i -lt 7; $i += 2) {
        Add-Lbl $d $daysHe[$i] 8 $Y 50; Add-Txt $d $names[$i] 60 $Y 80
        if ($i+1 -lt 7) { Add-Lbl $d $daysHe[$i+1] 158 $Y 50; Add-Txt $d $names[$i+1] 210 $Y 80 }
        $Y += $R
    }

    Add-Btn $d "btnAdd" ([char]0x05D4 + [char]0x05D5 + [char]0x05E1 + [char]0x05E3 + " " + [char]0x2714) 20 ($Y+4) 90 26 $true
    Add-Btn $d "btnCancel" ([char]0x05D1 + [char]0x05D9 + [char]0x05D8 + [char]0x05D5 + [char]0x05DC) 120 ($Y+4) 70 26
    $d.Height = $Y + 44
    $uf.CodeModule.AddFromString($CODE_MIK)
    Write-Host "  frmMikveh built"
}

function Build-EventForm($vba) {
    $uf = $vba.VBComponents.Add(3); $uf.Name = "frmEvent"
    $d = $uf.Designer
    $W = 380; $d.Caption = "Add Event"; $d.Width = $W; try { $d.BackColor = 0xF8FAFF } catch {}
    $Y = 8; $R = 26

    Add-SectionLabel $d ([char]0x05E4 + [char]0x05E8 + [char]0x05D8 + [char]0x05D9 + " " + [char]0x05D0 + [char]0x05D9 + [char]0x05E8 + [char]0x05D5 + [char]0x05E2) $Y $W; $Y += 22
    Add-Lbl $d ([char]0x05DE + [char]0x05D6 + [char]0x05D4 + [char]0x05D4 + " *") 8 $Y; Add-Txt $d "txtId" 96 $Y 100
    Add-Lbl $d ([char]0x05E7 + [char]0x05D8 + [char]0x05D2 + [char]0x05D5 + [char]0x05E8 + [char]0x05D9 + [char]0x05D4) 214 $Y; Add-Cmb $d "cmbCategory" 270 $Y 102
    $Y += $R
    Add-Lbl $d ([char]0x05DB + [char]0x05D5 + [char]0x05EA + [char]0x05E8 + [char]0x05EA + " *") 8 $Y; Add-Txt $d "txtTitle" 96 $Y 276
    $Y += $R
    Add-Lbl $d ([char]0x05EA + [char]0x05D9 + [char]0x05D0 + [char]0x05D5 + [char]0x05E8) 8 $Y
    $txtDesc = Add-Txt $d "txtDesc" 96 $Y 276 40
    try { $txtDesc.MultiLine = $true } catch {}
    $Y += 46
    Add-Lbl $d ([char]0x05EA + [char]0x05D0 + [char]0x05E8 + [char]0x05D9 + [char]0x05DA + " " + [char]0x05D4 + [char]0x05EA + [char]0x05D7 + [char]0x05DC + [char]0x05D4 + " *") 8 $Y
    Add-Txt $d "txtStartDate" 96 $Y 130
    Add-Lbl $d "YYYY-MM-DD HH:MM" 232 $Y 140 14 $false 0x888888
    $Y += $R
    Add-Lbl $d ([char]0x05EA + [char]0x05D0 + [char]0x05E8 + [char]0x05D9 + [char]0x05DA + " " + [char]0x05E1 + [char]0x05D9 + [char]0x05D5 + [char]0x05DD) 8 $Y; Add-Txt $d "txtEndDate" 96 $Y 130
    $Y += $R
    Add-Lbl $d ([char]0x05DE + [char]0x05D9 + [char]0x05E7 + [char]0x05D5 + [char]0x05DD) 8 $Y; Add-Txt $d "txtLocation" 96 $Y 130
    Add-Lbl $d ([char]0x05DE + [char]0x05D0 + [char]0x05E8 + [char]0x05D2 + [char]0x05DF) 240 $Y; Add-Txt $d "txtOrganizer" 280 $Y 92
    $Y += $R
    Add-Chk $d "chkAlert" ([char]0x05D4 + [char]0x05EA + [char]0x05E8 + [char]0x05D0 + [char]0x05D4 + " " + [char]0x05D3 + [char]0x05D7 + [char]0x05D5 + [char]0x05E4 + [char]0x05D4) 8 $Y 250
    $Y += $R + 6

    Add-Btn $d "btnAdd" ([char]0x05D4 + [char]0x05D5 + [char]0x05E1 + [char]0x05E3 + " " + [char]0x2714) 20 $Y 90 26 $true
    Add-Btn $d "btnCancel" ([char]0x05D1 + [char]0x05D9 + [char]0x05D8 + [char]0x05D5 + [char]0x05DC) 120 $Y 70 26
    $Y += 36; $d.Height = $Y + 10
    $uf.CodeModule.AddFromString($CODE_EVT)
    Write-Host "  frmEvent built"
}

function Build-ShiurForm($vba) {
    $uf = $vba.VBComponents.Add(3); $uf.Name = "frmShiur"
    $d = $uf.Designer
    $W = 370; $d.Caption = "Add Shiur"; $d.Width = $W; try { $d.BackColor = 0xF8FAFF } catch {}
    $Y = 8; $R = 26

    Add-SectionLabel $d ([char]0x05E4 + [char]0x05E8 + [char]0x05D8 + [char]0x05D9 + " " + [char]0x05E9 + [char]0x05D9 + [char]0x05E2 + [char]0x05D5 + [char]0x05E8) $Y $W; $Y += 22
    Add-Lbl $d ([char]0x05D1 + [char]0x05D9 + [char]0x05EA + " " + [char]0x05DB + [char]0x05E0 + [char]0x05E1 + [char]0x05EA + " *") 8 $Y; Add-Cmb $d "cmbSynId" 96 $Y 130
    Add-Lbl $d ([char]0x05DE + [char]0x05D6 + [char]0x05D4 + [char]0x05D4 + " *") 240 $Y 80; Add-Txt $d "txtShiurId" 310 $Y 52
    $Y += $R
    Add-Lbl $d ([char]0x05E9 + [char]0x05DD + " " + [char]0x05E9 + [char]0x05D9 + [char]0x05E2 + [char]0x05D5 + [char]0x05E8 + " *") 8 $Y; Add-Txt $d "txtTitle" 96 $Y 266
    $Y += $R
    Add-Lbl $d ([char]0x05DE + [char]0x05E8 + [char]0x05E6 + [char]0x05D4 + " / " + [char]0x05E8 + [char]0x05D1) 8 $Y; Add-Txt $d "txtRabbi" 96 $Y 266
    $Y += $R
    Add-Lbl $d ([char]0x05D9 + [char]0x05DE + [char]0x05D9 + [char]0x05DD) 8 $Y; Add-Txt $d "txtDays" 96 $Y 120
    Add-Lbl $d "1,2..7 / daily" 222 $Y 90 14 $false 0x888888
    $Y += $R
    Add-Lbl $d ([char]0x05E9 + [char]0x05E2 + [char]0x05D4 + " (HH:MM)") 8 $Y; Add-Txt $d "txtTime" 96 $Y 80
    $Y += $R
    Add-Lbl $d ([char]0x05EA + [char]0x05D9 + [char]0x05D0 + [char]0x05D5 + [char]0x05E8) 8 $Y; Add-Txt $d "txtDesc" 96 $Y 266
    $Y += $R + 6

    Add-Btn $d "btnAdd" ([char]0x05D4 + [char]0x05D5 + [char]0x05E1 + [char]0x05E3 + " " + [char]0x2714) 20 $Y 90 26 $true
    Add-Btn $d "btnCancel" ([char]0x05D1 + [char]0x05D9 + [char]0x05D8 + [char]0x05D5 + [char]0x05DC) 120 $Y 70 26
    $Y += 36; $d.Height = $Y + 10
    $uf.CodeModule.AddFromString($CODE_SHI)
    Write-Host "  frmShiur built"
}

# ─── Add + buttons to each data sheet ────────────────────────────────────────

$SHEET_BUTTONS = [ordered]@{
    ([char]0x05D1 + [char]0x05EA + [char]0x05D9 + "_" + [char]0x05DB + [char]0x05E0 + [char]0x05E1 + [char]0x05EA)           = "AddSynagogue"
    ([char]0x05EA + [char]0x05E4 + [char]0x05D9 + [char]0x05DC + [char]0x05D5 + [char]0x05EA + "_" + [char]0x05DE + [char]0x05E4 + [char]0x05D5 + [char]0x05E8 + [char]0x05D8 + [char]0x05D5 + [char]0x05EA) = "AddPrayer"
    ([char]0x05DE + [char]0x05E1 + [char]0x05E2 + [char]0x05D3 + [char]0x05D5 + [char]0x05EA + "_" + [char]0x05DB + [char]0x05E9 + [char]0x05E8 + [char]0x05D5 + [char]0x05EA)           = "AddRestaurant"
    ([char]0x05DE + [char]0x05E7 + [char]0x05D5 + [char]0x05D0 + [char]0x05D5 + [char]0x05EA)                                  = "AddMikveh"
    ([char]0x05D0 + [char]0x05D9 + [char]0x05E8 + [char]0x05D5 + [char]0x05E2 + [char]0x05D9 + [char]0x05DD + "_" + [char]0x05D5 + [char]0x05E9 + [char]0x05D9 + [char]0x05E2 + [char]0x05D5 + [char]0x05E8 + [char]0x05D9 + [char]0x05DD) = "AddEvent"
    ([char]0x05E9 + [char]0x05D9 + [char]0x05E2 + [char]0x05D5 + [char]0x05E8 + [char]0x05D9 + [char]0x05DD + "_" + [char]0x05E7 + [char]0x05D1 + [char]0x05D5 + [char]0x05E2 + [char]0x05D9 + [char]0x05DD) = "AddShiur"
}

function Add-SheetButtons($wb) {
    foreach ($sheetName in $SHEET_BUTTONS.Keys) {
        $macroName = $SHEET_BUTTONS[$sheetName]
        try {
            $ws = $wb.Sheets($sheetName)
        } catch {
            Write-Host "  [warn] sheet not found: $sheetName"
            continue
        }
        $shp = $ws.Shapes.AddShape(1, 4, 4, 90, 22)  # msoShapeRectangle
        $shp.TextFrame.Characters().Text = ([char]0x05D4 + [char]0x05D5 + [char]0x05E1 + [char]0x05E3 + " " + [char]0x2795)
        try {
            $shp.TextFrame.Characters().Font.Name = "Arial"
            $shp.TextFrame.Characters().Font.Size = 10
            $shp.TextFrame.Characters().Font.Bold = $true
            $shp.TextFrame.Characters().Font.Color = 0xFFFFFF
            $shp.Fill.ForeColor.RGB = 0x2E6DB4
            $shp.Line.Visible = $false
            $shp.TextFrame.HorizontalAlignment = 2
        } catch {}
        $shp.OnAction = $macroName
        Write-Host "  Button added: $sheetName"
    }
}

# ─── Main ─────────────────────────────────────────────────────────────────────

$src  = "C:\Temp\kehila_base.xlsx"
$tmp  = "C:\Temp\kehila_base_tmp.xlsm"
$dest = "C:\Temp\kehila_data_template.xlsm"

$xl = New-Object -ComObject Excel.Application
$xl.Visible = $false
$xl.DisplayAlerts = $false
$xl.AutomationSecurity = 1

try {
    # Save .xlsx as .xlsm first — xlsx files don't have an initialized VBA project
    Write-Host "Opening $src ..."
    $wb0 = $xl.Workbooks.Open($src)
    $wb0.SaveAs($tmp, 52)   # 52 = xlOpenXMLWorkbookMacroEnabled
    $wb0.Close($false)
    Write-Host "Saved temp .xlsm, reopening..."

    $wb = $xl.Workbooks.Open($tmp)
    $vba = $wb.VBProject

    if ($vba -eq $null) {
        throw "VBProject is null — ensure 'Trust access to the VBA project object model' is enabled in Excel Trust Center."
    }
    Write-Host "VBA project access OK: [$($vba.Name)]"

    # Main module
    $mod = $vba.VBComponents.Add(1)
    $mod.Name = "KehilaForms"
    $mod.CodeModule.AddFromString($MAIN_MOD)
    Write-Host "KehilaForms module added"

    # UserForms
    Write-Host "Building forms..."
    Build-SynagogueForm  $vba
    Build-PrayerForm     $vba
    Build-RestaurantForm $vba
    Build-MikvehForm     $vba
    Build-EventForm      $vba
    Build-ShiurForm      $vba

    # Sheet buttons
    Write-Host "Adding sheet buttons..."
    Add-SheetButtons $wb

    # Save final .xlsm
    Write-Host "Saving $dest ..."
    if (Test-Path $dest) { Remove-Item $dest -Force }
    $wb.SaveAs($dest, 52)   # 52 = xlOpenXMLWorkbookMacroEnabled
    $wb.Close($false)
    if (Test-Path $tmp) { Remove-Item $tmp -Force }
    Write-Host "Done! Saved to $dest"

} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
    Write-Host $_.ScriptStackTrace
} finally {
    try { $xl.Quit() } catch {}
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($xl) | Out-Null
}
