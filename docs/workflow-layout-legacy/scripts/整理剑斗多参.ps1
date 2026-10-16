$ErrorActionPreference='Stop'
$source='C:\Users\Administrator\Desktop\剑斗多参模式.json'
$target=Join-Path $PSScriptRoot '剑斗多参模式_紧凑模块整理版.json'
$original=Get-Content -LiteralPath $source -Raw -Encoding UTF8 | ConvertFrom-Json
$w=Get-Content -LiteralPath $source -Raw -Encoding UTF8 | ConvertFrom-Json
$positions=@{
    127=@(0,100);150=@(515,100);128=@(0,244);119=@(0,412);120=@(0,532)
    138=@(0,800);137=@(0,1565);152=@(394.1,1565);162=@(788.2,1565)
    132=@(0,2230);131=@(330.1,2230);148=@(580,2230);184=@(0,2465)
    136=@(1250,600)
    147=@(1250,20);176=@(1794,20);151=@(2339,20)
    124=@(2910,200);154=@(3245,200);158=@(3535,200)
    126=@(2910,600);129=@(2910,740);123=@(3242,740);125=@(3860,600)
    155=@(4250,200);179=@(4660,200);156=@(5070,200)
    157=@(5480,600);160=@(5480,740);159=@(5760,600)
    122=@(6120,600);121=@(6120,720);130=@(6390,600);178=@(6680,600);92=@(6880,600)
    167=@(1250,1500);180=@(1250,1800);181=@(1507,1800);182=@(1783,1800);185=@(2085,1800)
}
if ($positions.Count -ne $w.nodes.Count) {throw '节点数量与布局表不一致'}
foreach ($n in $w.nodes) {
    if (-not $positions.ContainsKey([int]$n.id)) {throw "未排布节点 $($n.id)"}
    $n.pos=$positions[[int]$n.id]
}
$modules=@(
    @{t='01 模型｜大模型 → CLIP → VAE（从上到下）';c='#47775b';n=@(127,150,128,119,120)},
    @{t='02 提示词';c='#355f73';n=@(138)},
    @{t='03 多参考图';c='#355f73';n=@(137,152,162)},
    @{t='04 时长、帧数与分辨率';c='#355f73';n=@(132,131,148)},
    @{t='05 多参考条件与初始潜变量';c='#537f83';n=@(136)},
    @{t='06 一采模型 · LoRA 链';c='#76558a';n=@(147,176,151)},
    @{t='07 Sigma 调度 → 扩展 → 高低段拆分';c='#8a713e';n=@(124,154,158)},
    @{t='08 一采引导、噪声与共享采样器';c='#645c8c';n=@(126,129,123)},
    @{t='09 一采执行';c='#645c8c';n=@(125)},
    @{t='10 二采模型 · LoRA 链';c='#76558a';n=@(155,179,156)},
    @{t='11 二采引导 · 不追加噪声';c='#865582';n=@(157,160)},
    @{t='12 二采执行';c='#865582';n=@(159)},
    @{t='13 视频与音频解码';c='#477783';n=@(122,121)},
    @{t='14 视频合成';c='#477783';n=@(130)},
    @{t='15 显存清理';c='#477783';n=@(178)},
    @{t='16 成片保存';c='#477783';n=@(92)},
    @{t='未连接文本节点 · 保留原内容';c='#666666';n=@(167,180,181,182,185)},
    @{t='原工作流说明';c='#666666';n=@(184)}
)
$assigned=@($modules | ForEach-Object {$_.n})
if ($assigned.Count -ne $w.nodes.Count -or @($assigned | Select-Object -Unique).Count -ne $w.nodes.Count) {throw '模块覆盖异常'}
$id=27
$w.groups=@($modules | ForEach-Object {
    $m=$_;$nodes=@($w.nodes | Where-Object {$_.id -in $m.n})
    $left=($nodes | ForEach-Object {$_.pos[0]} | Measure-Object -Minimum).Minimum-7
    $top=($nodes | ForEach-Object {$_.pos[1]} | Measure-Object -Minimum).Minimum-56
    $right=($nodes | ForEach-Object {$_.pos[0]+$_.size[0]} | Measure-Object -Maximum).Maximum+7
    $bottom=($nodes | ForEach-Object {$_.pos[1]+$_.size[1]} | Measure-Object -Maximum).Maximum+7
    [pscustomobject]@{id=$id;title=$m.t;color=$m.c;font_size=16;flags=[pscustomobject]@{};bounding=@($left,$top,($right-$left),($bottom-$top))}
    $id++
})
$w.extra.ds.scale=0.20
$w.extra.ds.offset=@(80,100)
function Intersects($a,$b) {
    return ($a[0] -lt $b[0]+$b[2] -and $a[0]+$a[2] -gt $b[0] -and $a[1] -lt $b[1]+$b[3] -and $a[1]+$a[3] -gt $b[1])
}
for ($i=0;$i -lt $w.nodes.Count;$i++) {
    $a=$w.nodes[$i]
    for ($j=$i+1;$j -lt $w.nodes.Count;$j++) {
        $b=$w.nodes[$j]
        if (Intersects @($a.pos[0],($a.pos[1]-30),$a.size[0],($a.size[1]+30)) @($b.pos[0],($b.pos[1]-30),$b.size[0],($b.size[1]+30))) {throw "节点重叠 $($a.id), $($b.id)"}
    }
}
for ($i=0;$i -lt $w.groups.Count;$i++) {
    for ($j=$i+1;$j -lt $w.groups.Count;$j++) {
        if (Intersects $w.groups[$i].bounding $w.groups[$j].bounding) {throw "分组重叠 $($w.groups[$i].title), $($w.groups[$j].title)"}
    }
}
foreach ($link in $w.links) {
    $a=$w.nodes | Where-Object id -eq $link[1];$b=$w.nodes | Where-Object id -eq $link[3]
    if ($a.pos[0]+$a.size[0] -gt $b.pos[0]) {throw "连线逆向 $($link[0])"}
}
[IO.File]::WriteAllText($target,($w | ConvertTo-Json -Depth 100),[Text.UTF8Encoding]::new($false))
$check=Get-Content -LiteralPath $target -Raw -Encoding UTF8 | ConvertFrom-Json
$check.groups=$original.groups;$check.extra.ds=$original.extra.ds
foreach ($n in $check.nodes) {$n.pos=($original.nodes | Where-Object id -eq $n.id).pos}
if (($check | ConvertTo-Json -Depth 100 -Compress) -cne ($original | ConvertTo-Json -Depth 100 -Compress)) {throw '计算数据发生变化'}
Write-Output "已生成：$target"
Write-Output "验证通过：$($w.nodes.Count) 个节点，$($w.links.Count) 条连线，$($w.groups.Count) 个分组；节点与组无重叠，连线从左向右；仅更改位置、分组和视角。"
