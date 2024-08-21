---
title: "When polymorphism bites you in the butt"
date: 2018-07-02T12:00:00+01:00
tags:
  - scala
  - java
  - functional programming
  - unit testing
---

A curious problem I faced recently when Java polymorphism met Scala polymorphism and they gave a birth to an ugly baby that I had to confront.

A short prehistory: we have a huge monolithic Scala web-application that was written 4 years ago and was barely maintained since then (however, it worked surprisingly well all that time). There are a lot of Java dependencies used in the project and despite the claims that Scala has [_"seamless Java interop"_](https://www.scala-lang.org/), it's not all rainbows and unicorns.

## "Error: ambiguous reference to overloaded definition..." WHAT?

![Ron](./swanson.jpg)

We use an excellent [Mockito](http://site.mockito.org/) framework in unit-tests, but it was never upgraded from v1 to v2, so we decided to fix that since [a lot of nice improvements](https://github.com/mockito/mockito/wiki/What%27s-new-in-Mockito-2) were introduced in v2 that might make our unit-tests cleaner and better.

The upgrade was mostly seamless, however some methods changed their signature, in particular [`doReturn`](https://static.javadoc.io/org.mockito/mockito-core/2.19.0/org/mockito/Mockito.html#doReturn-java.lang.Object-) now had two versions:

```java
// similar to the old version that we use in our tests
public static Stubber doReturn(Object toBeReturned)

// a new, varargs version
public static Stubber doReturn(Object toBeReturned, Object... toBeReturnedNext)
```

<br>So basically the second version is a convenient new way to check more than one values at once:

```java
// uses first version of the method
doReturn("bar").when(mock).foo();

// uses a new, second version
doReturn("bar", "foo", "qix").when(mock).foo();
```

<br>Mockito is targetting Java and apparently Java is perfectly capable of recognizing when a single-argument version is called and when — the varargs one. However, when calling the same method from Scala we get an exception:

```java
Error: ambiguous reference to overloaded definition,
both method doReturn in object Mockito of type (x$1: Any, x$2: Object*)org.mockito.stubbing.Stubber
and  method doReturn in object Mockito of type (x$1: Any)org.mockito.stubbing.Stubber
match argument types (String)
            doReturn("bar").when(mock).foo()
```

<br>What this error means is that Scala can not recognize which version of the method has been called. Scala compiler thinks that both methods are equally valid candidates for that case. Now that's interesting. Let's try to understand why.

## Investigation

![Poirot](./poirot.jpg)

When we call it with 2 or more arguments, a compiler sees **right away** that the second method is applicable, so no further investigation is performed, case closed, everyone can go home.

However, when we call `doReturn` method with 1 argument, both versions are applicable! And the reason is that vararg parameter `toBeReturnedNext` can receive any number of arguments including... `0`.

Now, when Scala compiler sees this kind of embarassing situation, it performs a so-called **[overloading resolution](https://www.scala-lang.org/files/archive/spec/2.12/06-expressions.html#overloading-resolution)** by trying to understand which one of two methods is more specific. And for some reason both methods are equally specific in our case, hence the `ambiguous reference to overloaded definition` error.

Let's look at those two methods again:

```java
// A
public static Stubber doReturn(Object toBeReturned)

// B
public static Stubber doReturn(Object toBeReturned, Object... toBeReturnedNext)
```

<br>It's possible to call B with parameters of A because as we already figured out, `toBeReturnedNext` can contain 0 elements. Fair enough.

But why on Earth would compiler think that it's also possible to call A with the parameters of B when there are 2 or more arguments? Method A receives only one argument isn't it?

## "I love the smell of implicit polymorphism in the morning", — Martin Odersky

![napalm](./napalm.jpg)

Now this is when [one of](https://github.com/scala/scala-dev/issues/496) [the most](https://issues.scala-lang.org/browse/SI-3583) [controversial](https://groups.google.com/forum/#!topic/scala-debate/2fPsj1q-CXg) [Scala](https://github.com/scala/bug/issues/3583) [feautures](https://contributors.scala-lang.org/t/lets-drop-auto-tupling/1799) comes to play called "auto-tupling":

If a function receives **one parameter of a type that can be infered to a tuple** (`Object`, `AnyRef`, etc.), we can call it **with more than one arguments** and these arguments will be **implicitly converted into a tuple**! Now that's fun. Take a look:

```scala
// tuple conversion is applicable because Object can be infered as a tuple
def f = (x: Object) => println(x)

f(1, 2, 3)
// output: "(1, 2, 3)"

// no tuple conversion here because a type of parameter x is more specific and can not be a tuple
def m = (x: List[Int]) => println(x)

m(1, 2, 3)
// output: "too many arguments (3) for method apply..."
```
<small>[[live example]](https://scastie.scala-lang.org/mistadikay/yorHmKzARdC4IKF5N6qMxw/4)</small>

> The aim of auto-tupling is just to avoid weird looking ((a, b, c)) syntax.
> <cite><small>[Martin Odersky](https://github.com/lampepfl/dotty/pull/51#issuecomment-37437618)</small></cite>

Ah well, at least it's pretty.

So given the fact that auto-tupling is possible, it's possible to call A with the parameters of B since they can be converted into a tuple which makes A and B equally specific during overloading resolution.

## There is hope

![hope](./hope.jpg)

Now it's unlikely that it's going to be fixed in Scala 2. But there is hope.

> Dotty still uses auto-tupling but not as pervasively as nsc. In particular, auto-tupling is done after overloading resolution. It's a last effort attempt if things do not work out without it.
> <cite><small>[Martin Odersky](https://issues.scala-lang.org/browse/SI-2991?focusedCommentId=73778&page=com.atlassian.jira.plugin.system.issuetabpanels%3Acomment-tabpanel#comment-73778)</small></cite>

Another quote:

> Note that compared to Scala 2.x, auto-tupling is more restricted. ... it does not apply if the function in question is overloaded. This avoids problems like accidentally picking an overloaded variant taking an Object parameter when some other variant is intended but the right number of parameters is not passed.
> <cite><small>[Martin Odersky](hhttps://github.com/lampepfl/dotty/pull/51#issuecomment-37105935)</small></cite>

So auto-tupling is not going anywhere, but at least Scala 3 will not shit its pants during overloading resolution.

The following code will throw `ambiguous reference...` error in scalac, but will work in dotty (a fixed arity version is given a higher priority):

```scala
class X {
  def f(x: AnyRef) = x
  def f(x: AnyRef, y: AnyRef*) = x
}

val x = new X
println(x.f("a"))
```
<small>scalac: [[live example]](https://scastie.scala-lang.org/mistadikay/YhYi4frSTaCFql5mmIW8CQ/2)</small><br/>
<small>dotty: [[live example]](https://scastie.scala-lang.org/mistadikay/LlqHuNDRTcq30VALXW61Mg/2)</small>

## But what to do now?

I'd argue that it would probably be better to not have this kind of polymorphic mess in the first place. But if we're not controlling the code (like in our case with Mockito), we can:

1. Create a Java class that will wrap ambigious methods.
2. If we don't care which version is called, pass an empty sequence as a second argument to resolve ambiguity:

```scala
class X {
  def f(x: AnyRef) = x
  def f(x: AnyRef, y: AnyRef*) = x
}

val x = new X
println(x.f("a", Seq.empty: _*))
```
<small>[[live example]](https://scastie.scala-lang.org/mistadikay/Kn2HIzFoTXO4LcrHi6ApFg/4)</small>

### References: 
* [JIRA ticket](https://issues.scala-lang.org/browse/SI-2991?orig=1)
* [Scala spec on implicit conversions](https://www.scala-lang.org/files/archive/spec/2.12/06-expressions.html#implicit-conversions)
* [stackoverflow](https://stackoverflow.com/questions/2159248/spurious-ambiguous-reference-error-in-scala-2-7-7-compiler-interpreter/2161551#2161551)
