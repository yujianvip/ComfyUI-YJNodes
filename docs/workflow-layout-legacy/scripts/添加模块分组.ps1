$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot 'BUNNY_H3_高动态双采放大专属_FL2VA_REF2VA+_紧密水平版.json'
$target = Join-Path $PSScriptRoot 'BUNNY_H3_高动态双采放大专属_FL2VA_REF2VA+_模块分组版.json'
$w = Get-Content -LiteralPath $source -Raw -Encoding UTF8 | ConvertFrom-Json
$original = Get-Content -LiteralPath $source -Raw -Encoding UTF8 | ConvertFrom-Json
# 为新增组标题留出最小空间；主流程的 y=660 和所有横坐标保持不变。
$dy = @{6=24;35=24;36=24;37=24;27=48;30=48;29=48;11=72;55=96;47=-24;45=-24;48=-24;46=-24;58=24;57=48;60=24;59=24;61=24}
foreach ($n in $w.nodes) { if ($dy.ContainsKey([int]$n.id)) { $n.pos=@($n.pos[0],($n.pos[1]+$dy[[int]$n.id])) } }
$modules = @(
    @{p=21;t='提示词';n=@(49)},
    @{p=21;t='参考图';n=@(6,35,36,37)},
    @{p=21;t='时长、帧数与基础尺寸';n=@(27,30,29)},
    @{p=21;t='共享噪声';n=@(11)},
    @{p=21;t='输入说明';n=@(55)},
    @{p=22;t='一采 LoRA';n=@(47,45)},
    @{p=22;t='一采条件';n=@(7)},
    @{p=22;t='一采调度与引导';n=@(8,9,10)},
    @{p=22;t='一采执行';n=@(12)},
    @{p=22;t='一采说明';n=@(58)},
    @{p=22;t='LoRA 说明';n=@(57)},
    @{p=23;t='潜空间放大';n=@(54,13)},
    @{p=23;t='放大说明';n=@(59)},
    @{p=24;t='二采 LoRA';n=@(48,46)},
    @{p=24;t='高分辨率条件';n=@(14)},
    @{p=24;t='潜变量与音频协调';n=@(15)},
    @{p=24;t='细节调度与引导';n=@(16,17)},
    @{p=24;t='二采执行';n=@(19)},
    @{p=24;t='二采说明';n=@(60)},
    @{p=25;t='音视频解码';n=@(20)},
    @{p=25;t='视频合成';n=@(51)},
    @{p=25;t='显存清理';n=@(52)},
    @{p=25;t='成片保存';n=@(53)},
    @{p=25;t='输出说明';n=@(61)}
)
function Bounds($nodes,$side,$top,$bottom) {
    $l=($nodes | ForEach-Object {$_.pos[0]} | Measure-Object -Minimum).Minimum-$side
    $t=($nodes | ForEach-Object {$_.pos[1]} | Measure-Object -Minimum).Minimum-$top
    $r=($nodes | ForEach-Object {$_.pos[0]+$_.size[0]} | Measure-Object -Maximum).Maximum+$side
    $b=($nodes | ForEach-Object {$_.pos[1]+$_.size[1]} | Measure-Object -Maximum).Maximum+$bottom
    return @($l,$t,($r-$l),($b-$t))
}
$newGroups=@(); $id=27
foreach ($m in $modules) {
    $parent=$w.groups | Where-Object id -eq $m.p
    $members=@($w.nodes | Where-Object {$_.id -in $m.n})
    $newGroups += [pscustomobject]@{id=$id;title=$m.t;color=$parent.color;font_size=16;flags=[pscustomobject]@{};bounding=(Bounds $members 7 52 7)}
    $id++
}
foreach ($parent in $w.groups) {
    $definitions=@($modules | Where-Object p -eq $parent.id)
    if ($definitions.Count -gt 0) {
        $ids=@($definitions | ForEach-Object {$_.n})
        $parent.bounding=Bounds @($w.nodes | Where-Object {$_.id -in $ids}) 12 90 12
    }
}
$w.groups=@($w.groups)+$newGroups
# 新增子分组之间不交叠，且仅包含预定节点；大分区负责包住子分组。
for ($i=0;$i -lt $newGroups.Count;$i++) {
    $a=$newGroups[$i].bounding
    for ($j=$i+1;$j -lt $newGroups.Count;$j++) {
        $b=$newGroups[$j].bounding
        if ($a[0] -lt $b[0]+$b[2] -and $a[0]+$a[2] -gt $b[0] -and $a[1] -lt $b[1]+$b[3] -and $a[1]+$a[3] -gt $b[1]) {throw '子分组交叠'}
    }
}
[IO.File]::WriteAllText($target,($w | ConvertTo-Json -Depth 100),[Text.UTF8Encoding]::new($false))
$check=Get-Content -LiteralPath $target -Raw -Encoding UTF8 | ConvertFrom-Json
$check.groups=$original.groups
foreach ($n in $check.nodes) {$n.pos=($original.nodes | Where-Object id -eq $n.id).pos}
if (($check | ConvertTo-Json -Depth 100 -Compress) -cne ($original | ConvertTo-Json -Depth 100 -Compress)) {throw '存在位置与分组以外的变化'}
Write-Output "已生成：$target"
Write-Output "已验证：保留 7 个大分区，新增 24 个模块子分组；子分组无交叠，除位置与分组外全部数据一致。"
